use std::cmp::Ordering;
use std::fs;
use std::io::Cursor;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use image::codecs::jpeg::JpegEncoder;
use image::imageops::{self, FilterType};
use image::{DynamicImage, GenericImageView, Rgb, RgbImage, Rgba, RgbaImage};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use tauri::Manager;
#[cfg(target_os = "windows")]
use windows::{
    Graphics::Imaging::BitmapDecoder,
    Media::Ocr::OcrEngine,
    Storage::StorageFile,
    core::{HSTRING, PWSTR},
};
#[cfg(target_os = "windows")]
use windows::Win32::{
    Foundation::{HLOCAL, LocalFree},
    Security::Cryptography::{
        CryptProtectData, CryptUnprotectData, CRYPTPROTECT_UI_FORBIDDEN, CRYPT_INTEGER_BLOB,
    },
};

const APP_NAME: &str = "鐢靛晢璁捐鍔╂墜";
const DEFAULT_UPDATE_MANIFEST_URL: &str = "http://192.192.3.180:8080/latest.json";
const SUPPORTED_EXTENSIONS: &[&str] = &["jpg", "jpeg", "png", "webp", "bmp", "tif", "tiff"];
const VISION_SYSTEM_PROMPT: &str = "浣犳槸涓€鍚嶈祫娣辩數鍟嗚瑙夎璁″笀鍜屽浘鐗囨彁绀鸿瘝宸ョ▼甯堛€傝鏋佽嚧璇︾粏鍦板垎鏋愮敤鎴锋彁渚涚殑鍥剧墖锛岃緭鍑哄彲鐢ㄤ簬璇︽儏椤靛鍒汇€佷骇鍝佽縼绉汇€佸浘鐢熷浘鍜屾枃鐢熷浘鐨勪腑鏂囨彁绀鸿瘝銆傛弿杩版椂瑕佽鐩栧浘鐗囧熀纭€淇℃伅銆佹暣浣撻鏍笺€佹瀯鍥剧増寮忋€佺敾闈㈠厓绱犮€佷骇鍝佷富浣撱€佹枃瀛楀唴瀹广€佸瓧浣撴帓鐗堛€佽壊褰╁厜褰便€佽儗鏅┖闂村拰鍙縼绉昏鍒欍€傛渶缁堣緭鍑轰竴娈靛畬鏁淬€佸彲鐩存帴浣跨敤鐨勭敓鍥炬彁绀鸿瘝銆?";
const PROTECTED_API_KEY_PREFIX: &str = "dpapi:";

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ApiConfig {
    provider: String,
    api_key: String,
    base_url: String,
    model: String,
}

impl Default for ApiConfig {
    fn default() -> Self {
        Self {
            provider: "Gemini".to_string(),
            api_key: String::new(),
            base_url: "https://generativelanguage.googleapis.com".to_string(),
            model: "gemini-1.5-flash".to_string(),
        }
    }
}

fn default_spacing_fill_mode_for_missing() -> String {
    "solid".to_string()
}

fn default_micro_shadow_percent() -> u8 {
    8
}

fn normalize_micro_shadow_percent(value: u8) -> f32 {
    value.clamp(1, 20) as f32 / 100.0
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct AppConfig {
    #[serde(default)]
    last_save_dir: String,
    #[serde(default = "default_spacing_fill_mode_for_missing")]
    spacing_fill_mode: String,
    #[serde(default = "default_micro_shadow_percent")]
    spacing_micro_shadow_percent: u8,
    #[serde(default)]
    prompt_api: ApiConfig,
    #[serde(default)]
    risk_api: ApiConfig,
    #[serde(default)]
    image_api: ApiConfig,
    #[serde(default)]
    update: UpdateConfig,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    api: Option<ApiConfig>,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            last_save_dir: String::new(),
            spacing_fill_mode: "gradient".to_string(),
            spacing_micro_shadow_percent: default_micro_shadow_percent(),
            prompt_api: ApiConfig::default(),
            risk_api: ApiConfig::default(),
            image_api: ApiConfig::default(),
            update: UpdateConfig::default(),
            api: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct UpdateConfig {
    #[serde(default)]
    manifest_url: String,
}

impl Default for UpdateConfig {
    fn default() -> Self {
        Self {
            manifest_url: DEFAULT_UPDATE_MANIFEST_URL.to_string(),
        }
    }
}

#[derive(Debug, Clone, Serialize)]
struct UpdateDownloadResult {
    path: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct TemplateImageResult {
    path: String,
    cost_summary: String,
    cost_amount: Option<f64>,
    cost_currency: String,
    usage_summary: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct PromptApiResult {
    text: String,
    cost_summary: String,
    cost_amount: Option<f64>,
    cost_currency: String,
    usage_summary: String,
}

#[derive(Debug, Clone, Serialize)]
struct ImageEntry {
    path: String,
    name: String,
    width: u32,
    height: u32,
    format: String,
    color_mode: String,
}

#[derive(Debug, Clone, Serialize)]
struct CollectResult {
    entries: Vec<ImageEntry>,
    ignored_count: usize,
    failed_files: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
struct SidePadding {
    #[serde(default)]
    value: i32,
    #[serde(default, alias = "verticalValue")]
    vertical_value: i32,
    #[serde(default, alias = "topValue")]
    top_value: i32,
    #[serde(default, alias = "bottomValue")]
    bottom_value: i32,
    #[serde(default = "default_side_padding_mode")]
    mode: String,
    #[serde(default = "default_side_padding_color")]
    color: String,
    #[serde(default = "default_micro_shadow_percent", alias = "microShadowPercent")]
    micro_shadow_percent: u8,
    #[serde(default)]
    enabled: bool,
}

#[derive(Debug, Clone, Deserialize)]
struct LayerTransform {
    #[serde(default)]
    x: f64,
    #[serde(default)]
    y: f64,
    #[serde(default = "default_layer_scale")]
    scale: f64,
    #[serde(default, alias = "scaleX")]
    scale_x: Option<f64>,
    #[serde(default, alias = "scaleY")]
    scale_y: Option<f64>,
}

fn default_layer_scale() -> f64 {
    1.0
}

fn default_side_padding_mode() -> String {
    "solid".to_string()
}

fn default_side_padding_color() -> String {
    "#FFFFFF".to_string()
}

#[derive(Debug, Clone, Serialize)]
struct OcrTextResult {
    text: String,
}

fn is_supported_image(path: &Path) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| SUPPORTED_EXTENSIONS.iter().any(|value| ext.eq_ignore_ascii_case(value)))
        .unwrap_or(false)
}

fn natural_cmp(a: &str, b: &str) -> Ordering {
    let mut a_chars = a.chars().peekable();
    let mut b_chars = b.chars().peekable();

    loop {
        match (a_chars.peek(), b_chars.peek()) {
            (None, None) => return Ordering::Equal,
            (None, Some(_)) => return Ordering::Less,
            (Some(_), None) => return Ordering::Greater,
            (Some(a_ch), Some(b_ch)) => {
                if a_ch.is_ascii_digit() && b_ch.is_ascii_digit() {
                    let mut a_num = String::new();
                    let mut b_num = String::new();
                    while let Some(ch) = a_chars.peek() {
                        if ch.is_ascii_digit() {
                            a_num.push(*ch);
                            a_chars.next();
                        } else {
                            break;
                        }
                    }
                    while let Some(ch) = b_chars.peek() {
                        if ch.is_ascii_digit() {
                            b_num.push(*ch);
                            b_chars.next();
                        } else {
                            break;
                        }
                    }
                    let a_trimmed = a_num.trim_start_matches('0');
                    let b_trimmed = b_num.trim_start_matches('0');
                    let a_key = if a_trimmed.is_empty() { "0" } else { a_trimmed };
                    let b_key = if b_trimmed.is_empty() { "0" } else { b_trimmed };
                    match a_key.len().cmp(&b_key.len()) {
                        Ordering::Equal => match a_key.cmp(b_key) {
                            Ordering::Equal => continue,
                            other => return other,
                        },
                        other => return other,
                    }
                } else {
                    let a_lower = a_ch.to_ascii_lowercase();
                    let b_lower = b_ch.to_ascii_lowercase();
                    a_chars.next();
                    b_chars.next();
                    match a_lower.cmp(&b_lower) {
                        Ordering::Equal => continue,
                        other => return other,
                    }
                }
            }
        }
    }
}

fn color_mode_name(image: &DynamicImage) -> String {
    format!("{:?}", image.color())
}

fn to_image_entry(path: &Path) -> Result<ImageEntry, String> {
    let reader = image::ImageReader::open(path).map_err(|err| err.to_string())?;
    let format = reader
        .format()
        .map(|value| format!("{value:?}"))
        .or_else(|| {
            path.extension()
                .and_then(|ext| ext.to_str())
                .map(|ext| ext.to_ascii_uppercase())
        })
        .unwrap_or_else(|| "Unknown".to_string());
    let image = reader.decode().map_err(|err| err.to_string())?;
    let (width, height) = image.dimensions();
    Ok(ImageEntry {
        path: path.to_string_lossy().to_string(),
        name: path
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or_default()
            .to_string(),
        width,
        height,
        format,
        color_mode: color_mode_name(&image),
    })
}

fn collect_from_path(path: &Path, entries: &mut Vec<PathBuf>, ignored: &mut usize) {
    if path.is_dir() {
        let mut children: Vec<PathBuf> = fs::read_dir(path)
            .ok()
            .into_iter()
            .flat_map(|iter| iter.filter_map(|entry| entry.ok().map(|item| item.path())))
            .collect();
        children.sort_by(|left, right| {
            let left_name = left.file_name().and_then(|v| v.to_str()).unwrap_or_default();
            let right_name = right.file_name().and_then(|v| v.to_str()).unwrap_or_default();
            natural_cmp(left_name, right_name)
        });
        for child in children {
            collect_from_path(&child, entries, ignored);
        }
        return;
    }

    if path.is_file() && is_supported_image(path) {
        entries.push(path.to_path_buf());
    } else {
        *ignored += 1;
    }
}

fn config_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|err| err.to_string())?
        .join(APP_NAME);
    Ok(dir.join("config.json"))
}

#[cfg(target_os = "windows")]
fn protect_secret(value: &str) -> Result<String, String> {
    let value = value.trim();
    if value.is_empty() || value.starts_with(PROTECTED_API_KEY_PREFIX) {
        return Ok(value.to_string());
    }
    let mut input = value.as_bytes().to_vec();
    let mut input_blob = CRYPT_INTEGER_BLOB {
        cbData: input.len() as u32,
        pbData: input.as_mut_ptr(),
    };
    let mut output_blob = CRYPT_INTEGER_BLOB::default();
    unsafe {
        CryptProtectData(
            &mut input_blob,
            None,
            None,
            None,
            None,
            CRYPTPROTECT_UI_FORBIDDEN,
            &mut output_blob,
        )
        .map_err(|err| format!("API Key 加密失败：{err}"))?;
        let protected = std::slice::from_raw_parts(output_blob.pbData, output_blob.cbData as usize).to_vec();
        let _ = LocalFree(Some(HLOCAL(output_blob.pbData as _)));
        use base64::Engine;
        use base64::engine::general_purpose::STANDARD;
        Ok(format!("{PROTECTED_API_KEY_PREFIX}{}", STANDARD.encode(protected)))
    }
}

#[cfg(not(target_os = "windows"))]
fn protect_secret(value: &str) -> Result<String, String> {
    Ok(value.trim().to_string())
}

#[cfg(target_os = "windows")]
fn unprotect_secret(value: &str) -> Result<String, String> {
    let value = value.trim();
    let Some(encoded) = value.strip_prefix(PROTECTED_API_KEY_PREFIX) else {
        return Ok(value.to_string());
    };
    use base64::Engine;
    use base64::engine::general_purpose::STANDARD;
    let mut protected = STANDARD
        .decode(encoded)
        .map_err(|err| format!("API Key 解密失败：{err}"))?;
    let mut input_blob = CRYPT_INTEGER_BLOB {
        cbData: protected.len() as u32,
        pbData: protected.as_mut_ptr(),
    };
    let mut output_blob = CRYPT_INTEGER_BLOB::default();
    unsafe {
        CryptUnprotectData(
            &mut input_blob,
            None::<*mut PWSTR>,
            None,
            None,
            None,
            CRYPTPROTECT_UI_FORBIDDEN,
            &mut output_blob,
        )
        .map_err(|err| format!("API Key 解密失败：{err}"))?;
        let bytes = std::slice::from_raw_parts(output_blob.pbData, output_blob.cbData as usize).to_vec();
        let _ = LocalFree(Some(HLOCAL(output_blob.pbData as _)));
        String::from_utf8(bytes).map_err(|err| format!("API Key 解密内容无效：{err}"))
    }
}

#[cfg(not(target_os = "windows"))]
fn unprotect_secret(value: &str) -> Result<String, String> {
    Ok(value.trim().to_string())
}

fn protect_api_config(api: &mut ApiConfig) -> Result<(), String> {
    api.api_key = protect_secret(&api.api_key)?;
    Ok(())
}

fn unprotect_api_config(api: &mut ApiConfig) {
    if api.api_key.trim().starts_with(PROTECTED_API_KEY_PREFIX) {
        api.api_key = unprotect_secret(&api.api_key).unwrap_or_default();
    }
}

fn config_for_save(config: &AppConfig) -> Result<AppConfig, String> {
    let mut protected = config.clone();
    protect_api_config(&mut protected.prompt_api)?;
    protect_api_config(&mut protected.risk_api)?;
    protect_api_config(&mut protected.image_api)?;
    if let Some(api) = protected.api.as_mut() {
        protect_api_config(api)?;
    }
    Ok(protected)
}

fn config_for_runtime(mut config: AppConfig) -> AppConfig {
    unprotect_api_config(&mut config.prompt_api);
    unprotect_api_config(&mut config.risk_api);
    unprotect_api_config(&mut config.image_api);
    if let Some(api) = config.api.as_mut() {
        unprotect_api_config(api);
    }
    config
}

fn ensure_config(app: &tauri::AppHandle) -> Result<AppConfig, String> {
    let path = config_path(app)?;
    if !path.exists() {
        let config = AppConfig::default();
        save_config_file(&path, &config)?;
        return Ok(config);
    }
    let text = fs::read_to_string(&path).map_err(|err| err.to_string())?;
    match serde_json::from_str::<AppConfig>(&text) {
        Ok(config) => Ok(config_for_runtime(config)),
        Err(_) => {
            let config = AppConfig::default();
            save_config_file(&path, &config)?;
            Ok(config)
        }
    }
}

fn save_config_file(path: &Path, config: &AppConfig) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|err| err.to_string())?;
    }
    let protected = config_for_save(config)?;
    let content = serde_json::to_string_pretty(&protected).map_err(|err| err.to_string())?;
    fs::write(path, content).map_err(|err| err.to_string())
}

fn parse_hex_color(color: &str) -> Result<(u8, u8, u8), String> {
    let value = color.trim().trim_start_matches('#');
    let expanded = match value.len() {
        3 => {
            let chars: Vec<char> = value.chars().collect();
            format!(
                "{}{}{}{}{}{}",
                chars[0], chars[0], chars[1], chars[1], chars[2], chars[2]
            )
        }
        6 => value.to_string(),
        _ => return Err("璇疯緭鍏ユ纭殑棰滆壊鑹插€硷紝渚嬪 #FFFFFF".to_string()),
    };
    let parsed = u32::from_str_radix(&expanded, 16).map_err(|_| "棰滆壊鍊兼棤鏁?".to_string())?;
    Ok((
        ((parsed >> 16) & 0xff) as u8,
        ((parsed >> 8) & 0xff) as u8,
        (parsed & 0xff) as u8,
    ))
}

fn flatten_image(image: DynamicImage, background: (u8, u8, u8)) -> RgbImage {
    let rgba = image.to_rgba8();
    let (width, height) = rgba.dimensions();
    let mut rgb = RgbImage::new(width, height);
    for y in 0..height {
        for x in 0..width {
            let pixel = rgba.get_pixel(x, y).0;
            let alpha = pixel[3] as f32 / 255.0;
            let inv = 1.0 - alpha;
            let r = (pixel[0] as f32 * alpha + background.0 as f32 * inv).round() as u8;
            let g = (pixel[1] as f32 * alpha + background.1 as f32 * inv).round() as u8;
            let b = (pixel[2] as f32 * alpha + background.2 as f32 * inv).round() as u8;
            rgb.put_pixel(x, y, Rgb([r, g, b]));
        }
    }
    rgb
}

fn resize_to_width(image: RgbImage, target_width: u32) -> RgbImage {
    let target_height = ((image.height() as f64 * target_width as f64) / image.width() as f64)
        .round()
        .max(1.0) as u32;
    DynamicImage::ImageRgb8(image)
        .resize_exact(target_width, target_height, FilterType::Lanczos3)
        .to_rgb8()
}

fn overlay_image(canvas: &mut RgbImage, image: &RgbImage, left: u32, top: u32) {
    for y in 0..image.height() {
        for x in 0..image.width() {
            let target_x = left + x;
            let target_y = top + y;
            if target_x < canvas.width() && target_y < canvas.height() {
                canvas.put_pixel(target_x, target_y, *image.get_pixel(x, y));
            }
        }
    }
}

fn fade_to_white(image: &RgbImage, amount: f32) -> RgbImage {
    let mut output = image.clone();
    for pixel in output.pixels_mut() {
        let r = (pixel[0] as f32 * (1.0 - amount) + 255.0 * amount).round() as u8;
        let g = (pixel[1] as f32 * (1.0 - amount) + 255.0 * amount).round() as u8;
        let b = (pixel[2] as f32 * (1.0 - amount) + 255.0 * amount).round() as u8;
        *pixel = Rgb([r, g, b]);
    }
    output
}

fn encode_jpeg(image: RgbImage) -> Result<Vec<u8>, String> {
    let mut bytes = Vec::new();
    let mut encoder = JpegEncoder::new_with_quality(Cursor::new(&mut bytes), 95);
    encoder
        .encode_image(&DynamicImage::ImageRgb8(image))
        .map_err(|err| err.to_string())?;
    Ok(bytes)
}

#[tauri::command]
fn collect_image_entries(paths: Vec<String>) -> Result<CollectResult, String> {
    let mut expanded = Vec::new();
    let mut ignored_count = 0usize;
    for raw in paths {
        collect_from_path(Path::new(&raw), &mut expanded, &mut ignored_count);
    }

    let mut failed_files = Vec::new();
    let mut entries = Vec::new();
    for path in expanded {
        match to_image_entry(&path) {
            Ok(entry) => entries.push(entry),
            Err(_) => {
                let name = path
                    .file_name()
                    .and_then(|value| value.to_str())
                    .unwrap_or_default()
                    .to_string();
                failed_files.push(name);
            }
        }
    }

    Ok(CollectResult {
        entries,
        ignored_count,
        failed_files,
    })
}

#[tauri::command]
fn read_image_data_url(path: String) -> Result<String, String> {
    let bytes = fs::read(&path).map_err(|err| err.to_string())?;
    let mime = match Path::new(&path)
        .extension()
        .and_then(|ext| ext.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase()
        .as_str()
    {
        "jpg" | "jpeg" => "image/jpeg",
        "png" => "image/png",
        "webp" => "image/webp",
        "bmp" => "image/bmp",
        "tif" | "tiff" => "image/tiff",
        _ => "application/octet-stream",
    };
    let encoded = {
        use base64::Engine;
        use base64::engine::general_purpose::STANDARD;
        STANDARD.encode(bytes)
    };
    Ok(format!("data:{mime};base64,{encoded}"))
}

fn parse_aspect_ratio(value: Option<&str>) -> Option<f64> {
    let value = value?.trim();
    if value.is_empty() || value.eq_ignore_ascii_case("auto") {
        return None;
    }
    let (width, height) = value.split_once(':')?;
    let width = width.trim().parse::<f64>().ok()?;
    let height = height.trim().parse::<f64>().ok()?;
    if width > 0.0 && height > 0.0 {
        Some(width / height)
    } else {
        None
    }
}

fn target_dimensions_for_aspect(original_width: u32, original_height: u32, aspect_override: Option<&str>) -> (u32, u32) {
    let Some(aspect) = parse_aspect_ratio(aspect_override) else {
        return (original_width.max(1), original_height.max(1));
    };
    if aspect >= 1.0 {
        let width = original_width.max(1);
        let height = (width as f64 / aspect).round().max(1.0) as u32;
        (width, height)
    } else {
        let height = original_height.max(1);
        let width = (height as f64 * aspect).round().max(1.0) as u32;
        (width, height)
    }
}

#[tauri::command]
fn save_pasted_image(app: tauri::AppHandle, data_base64: String, extension: String) -> Result<String, String> {
    let ext = extension
        .trim()
        .trim_start_matches('.')
        .to_ascii_lowercase();
    let ext = match ext.as_str() {
        "jpg" | "jpeg" => "jpg",
        "webp" => "webp",
        "bmp" => "bmp",
        "tif" | "tiff" => "tiff",
        _ => "png",
    };
    let bytes = {
        use base64::engine::general_purpose::STANDARD;
        use base64::Engine;
        STANDARD.decode(data_base64).map_err(|err| err.to_string())?
    };
    let _ = image::load_from_memory(&bytes).map_err(|err| format!("粘贴图片读取失败: {err}"))?;
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|err| err.to_string())?
        .as_millis();
    let dir = app
        .path()
        .app_cache_dir()
        .map_err(|err| err.to_string())?
        .join("pasted");
    fs::create_dir_all(&dir).map_err(|err| err.to_string())?;
    let path = dir.join(format!("pasted_{timestamp}.{ext}"));
    fs::write(&path, bytes).map_err(|err| err.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
async fn generate_template_image(
    original_path: String,
    product_paths: Vec<String>,
    prompt: String,
    aspect_override: Option<String>,
    api: ApiConfig,
) -> Result<TemplateImageResult, String> {
    if api.api_key.trim().is_empty() {
        return Err("鏈厤缃敓鍥?API锛屾棤娉曠敓鎴愬鐗堝浘鐗?".to_string());
    }
    if product_paths.is_empty() {
        return Err("璇峰厛涓婁紶闇€濂楃増鐨勪骇鍝佸浘".to_string());
    }

    let original = image::open(&original_path).map_err(|err| format!("read original image failed: {err}"))?;
    let (original_width, original_height) = original.dimensions();
    let (target_width, target_height) =
        target_dimensions_for_aspect(original_width, original_height, aspect_override.as_deref());
    let aspect_text = format!("{}:{}", target_width, target_height);

    let final_prompt = if prompt.trim().is_empty() {
        "一张电商主图，浅色背景，产品居中展示，高清商业摄影风格".to_string()
    } else {
        prompt.trim().to_string()
    };
    let final_prompt = format!(
        "{final_prompt}\n\n套版生成要求：\n- 第一张参考图是原图风格与版式参考，必须保持它的整体风格、构图、背景氛围、字体排版和尺寸比例 {aspect_text}。\n- 后续参考图是当前图片的产品与产品信息参考，必须使用其中真实产品外观、结构、颜色、卖点文字和产品信息，不要凭空更换产品。\n- 输出必须完整覆盖画布，不要裁剪左右或上下内容，不要拉伸变形，不要压扁产品，不要让主体或文字超出画面。\n- 保持原图参考的海报比例和视觉风格，产品、卖点和关键文字需要完整可见。"
    );
    let mut reference_paths = vec![original_path];
    reference_paths.extend(product_paths);
    request_image_generation(&api, &final_prompt, Some((target_width, target_height)), reference_paths).await
}

#[cfg(target_os = "windows")]
#[tauri::command]
async fn ocr_image_text(path: String) -> Result<OcrTextResult, String> {
    let mut lines = ocr_lines_from_path(&path)?;
    if let Ok(enhanced_path) = create_enhanced_ocr_image(&path) {
        if let Ok(extra_lines) = ocr_lines_from_path(&enhanced_path.to_string_lossy()) {
            for line in extra_lines {
                if !lines.iter().any(|value| value == &line) {
                    lines.push(line);
                }
            }
        }
        let _ = fs::remove_file(enhanced_path);
    }
    Ok(OcrTextResult {
        text: lines.join("\n"),
    })
}

#[cfg(target_os = "windows")]
fn ocr_lines_from_path(path: &str) -> Result<Vec<String>, String> {
    let file = StorageFile::GetFileFromPathAsync(&HSTRING::from(path))
        .map_err(|err| err.to_string())?
        .get()
        .map_err(|err| err.to_string())?;
    let stream = file
        .OpenReadAsync()
        .map_err(|err| err.to_string())?
        .get()
        .map_err(|err| err.to_string())?;
    let decoder = BitmapDecoder::CreateAsync(&stream)
        .map_err(|err| err.to_string())?
        .get()
        .map_err(|err| err.to_string())?;
    let bitmap = decoder
        .GetSoftwareBitmapAsync()
        .map_err(|err| err.to_string())?
        .get()
        .map_err(|err| err.to_string())?;
    let engine = OcrEngine::TryCreateFromUserProfileLanguages()
        .map_err(|err| err.to_string())?;
    let result = engine
        .RecognizeAsync(&bitmap)
        .map_err(|err| err.to_string())?
        .get()
        .map_err(|err| err.to_string())?;
    let lines = result.Lines().map_err(|err| err.to_string())?;
    let mut text_lines = Vec::new();
    for index in 0..lines.Size().map_err(|err| err.to_string())? {
        let line = lines.GetAt(index).map_err(|err| err.to_string())?;
        let text = line.Text().map_err(|err| err.to_string())?;
        let value = text.to_string();
        if !value.trim().is_empty() {
            text_lines.push(value);
        }
    }
    Ok(text_lines)
}

fn create_enhanced_ocr_image(path: &str) -> Result<PathBuf, String> {
    let image = image::open(path).map_err(|err| err.to_string())?;
    let flattened = flatten_image(image, (255, 255, 255));
    let width = flattened.width();
    let scale = if width < 1200 {
        2.0
    } else if width < 1800 {
        1.5
    } else {
        1.0
    };
    let target_width = ((width as f32 * scale).round() as u32).min(2400).max(1);
    let target_height = ((flattened.height() as f64 * target_width as f64) / flattened.width() as f64)
        .round()
        .max(1.0) as u32;
    let resized = imageops::resize(&flattened, target_width, target_height, FilterType::CatmullRom);
    let enhanced = imageops::contrast(&DynamicImage::ImageRgb8(resized), 18.0);
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|err| err.to_string())?
        .as_millis();
    let dir = std::env::temp_dir().join(APP_NAME).join("ocr");
    fs::create_dir_all(&dir).map_err(|err| err.to_string())?;
    let output = dir.join(format!("ocr_enhanced_{timestamp}.png"));
    DynamicImage::ImageRgba8(enhanced)
        .save(&output)
        .map_err(|err| err.to_string())?;
    Ok(output)
}

#[cfg(not(target_os = "windows"))]
#[tauri::command]
async fn ocr_image_text(_path: String) -> Result<OcrTextResult, String> {
    Err("当前本地 OCR 功能仅支持 Windows。".to_string())
}

#[tauri::command]
fn load_config(app: tauri::AppHandle) -> Result<AppConfig, String> {
    ensure_config(&app)
}

#[tauri::command]
fn save_config(app: tauri::AppHandle, config: AppConfig) -> Result<(), String> {
    let path = config_path(&app)?;
    save_config_file(&path, &config)
}

fn safe_update_file_name(value: &str, fallback_url: &str) -> String {
    let raw = if value.trim().is_empty() {
        fallback_url
            .split('?')
            .next()
            .and_then(|part| part.rsplit('/').next())
            .unwrap_or("update.exe")
    } else {
        value
    };
    let cleaned: String = raw
        .chars()
        .map(|ch| match ch {
            '\\' | '/' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            _ => ch,
        })
        .collect();
    let trimmed = cleaned.trim().trim_matches('.').to_string();
    if trimmed.is_empty() {
        "update.exe".to_string()
    } else {
        trimmed
    }
}

#[tauri::command]
async fn fetch_update_manifest(url: String) -> Result<serde_json::Value, String> {
    let trimmed_url = url.trim();
    if !(trimmed_url.starts_with("http://") || trimmed_url.starts_with("https://")) {
        return Err("更新清单地址必须是 http 或 https 地址".to_string());
    }
    let response = update_http_client()?
        .get(trimmed_url)
        .send()
        .await
        .map_err(|err| format!("读取更新清单失败：{err}"))?;
    if !response.status().is_success() {
        return Err(format!("读取更新清单失败：HTTP {}", response.status()));
    }
    response
        .json::<serde_json::Value>()
        .await
        .map_err(|err| format!("解析更新清单失败：{err}"))
}

#[tauri::command]
async fn download_update_file(
    app: tauri::AppHandle,
    url: String,
    file_name: Option<String>,
) -> Result<UpdateDownloadResult, String> {
    let trimmed_url = url.trim();
    if !(trimmed_url.starts_with("http://") || trimmed_url.starts_with("https://")) {
        return Err("更新下载地址必须是 http 或 https 地址".to_string());
    }
    let name = safe_update_file_name(file_name.as_deref().unwrap_or(""), trimmed_url);
    let download_dir = app
        .path()
        .download_dir()
        .map_err(|err| format!("无法获取下载目录：{err}"))?;
    fs::create_dir_all(&download_dir).map_err(|err| err.to_string())?;
    let output_path = download_dir.join(name);
    let response = update_http_client()?
        .get(trimmed_url)
        .send()
        .await
        .map_err(|err| format!("下载更新失败：{err}"))?;
    if !response.status().is_success() {
        return Err(format!("下载更新失败：HTTP {}", response.status()));
    }
    let bytes = response
        .bytes()
        .await
        .map_err(|err| format!("读取更新文件失败：{err}"))?;
    fs::write(&output_path, bytes).map_err(|err| format!("保存更新文件失败：{err}"))?;
    Ok(UpdateDownloadResult {
        path: output_path.to_string_lossy().to_string(),
    })
}

#[tauri::command]
fn open_target_folder(path: String) -> Result<(), String> {
    let target = PathBuf::from(path);
    let folder = if target.is_dir() {
        target
    } else {
        target
            .parent()
            .map(Path::to_path_buf)
            .unwrap_or_else(|| PathBuf::from("."))
    };
    #[cfg(target_os = "windows")]
    {
        Command::new("explorer")
            .arg(&folder)
            .spawn()
            .map_err(|err| format!("打开文件夹失败：{err}"))?;
    }
    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(&folder)
            .spawn()
            .map_err(|err| format!("打开文件夹失败：{err}"))?;
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        Command::new("xdg-open")
            .arg(&folder)
            .spawn()
            .map_err(|err| format!("打开文件夹失败：{err}"))?;
    }
    Ok(())
}

fn average_edge_pixel(image: &RgbImage, x: u32, y: u32, sample_height: u32) -> Rgb<u8> {
    let mut red = 0u32;
    let mut green = 0u32;
    let mut blue = 0u32;
    let mut count = 0u32;
    let start_y = y.saturating_sub(sample_height.saturating_sub(1));
    let end_y = y.min(image.height().saturating_sub(1));
    for sample_y in start_y..=end_y {
        let pixel = image.get_pixel(x, sample_y);
        red += pixel[0] as u32;
        green += pixel[1] as u32;
        blue += pixel[2] as u32;
        count += 1;
    }
    let count = count.max(1);
    Rgb([
        (red / count) as u8,
        (green / count) as u8,
        (blue / count) as u8,
    ])
}

fn blend_pixel(top: Rgb<u8>, bottom: Rgb<u8>, t: f32) -> Rgb<u8> {
    let inverse = 1.0 - t;
    Rgb([
        (top[0] as f32 * inverse + bottom[0] as f32 * t).round() as u8,
        (top[1] as f32 * inverse + bottom[1] as f32 * t).round() as u8,
        (top[2] as f32 * inverse + bottom[2] as f32 * t).round() as u8,
    ])
}

fn smooth_step(value: f32) -> f32 {
    let t = value.clamp(0.0, 1.0);
    t * t * (3.0 - 2.0 * t)
}

fn lighten_pixel(pixel: Rgb<u8>, amount: f32) -> Rgb<u8> {
    blend_pixel(pixel, Rgb([255, 255, 255]), amount)
}

fn darken_pixel(pixel: Rgb<u8>, amount: f32) -> Rgb<u8> {
    blend_pixel(pixel, Rgb([0, 0, 0]), amount)
}

fn side_padding_for_index(side_paddings: &[SidePadding], index: usize) -> SidePadding {
    side_paddings.get(index).cloned().unwrap_or_else(|| SidePadding {
        value: 0,
        vertical_value: 0,
        top_value: 0,
        bottom_value: 0,
        mode: "solid".to_string(),
        color: "#FFFFFF".to_string(),
        micro_shadow_percent: default_micro_shadow_percent(),
        enabled: false,
    })
}

fn clamp_side_padding(padding: &SidePadding, output_width: u32) -> u32 {
    if !padding.enabled || padding.value <= 0 || output_width <= 1 {
        return 0;
    }
    (padding.value as u32).min((output_width - 1) / 2)
}

fn side_crop_for_padding(padding: &SidePadding, output_width: u32) -> u32 {
    if !padding.enabled || padding.value >= 0 {
        return 0;
    }
    padding.value.unsigned_abs().min(output_width.saturating_mul(2))
}

fn vertical_padding_values(padding: &SidePadding) -> (i32, i32) {
    if !padding.enabled {
        return (0, 0);
    }
    if padding.top_value == 0 && padding.bottom_value == 0 && padding.vertical_value != 0 {
        (padding.vertical_value, padding.vertical_value)
    } else {
        (padding.top_value, padding.bottom_value)
    }
}

fn average_column_pixel(image: &RgbImage, x: u32, y: u32, sample_width: u32) -> Rgb<u8> {
    let mut red = 0u32;
    let mut green = 0u32;
    let mut blue = 0u32;
    let mut count = 0u32;
    let start_x = x.saturating_sub(sample_width.saturating_sub(1));
    let end_x = x.min(image.width().saturating_sub(1));
    for sample_x in start_x..=end_x {
        let pixel = image.get_pixel(sample_x, y);
        red += pixel[0] as u32;
        green += pixel[1] as u32;
        blue += pixel[2] as u32;
        count += 1;
    }
    let count = count.max(1);
    Rgb([
        (red / count) as u8,
        (green / count) as u8,
        (blue / count) as u8,
    ])
}

fn build_side_padding(
    image: &RgbImage,
    side_width: u32,
    side: &str,
    mode: &str,
    color: (u8, u8, u8),
) -> RgbImage {
    let height = image.height();
    let mut output = RgbImage::from_pixel(side_width, height, Rgb([color.0, color.1, color.2]));
    if side_width == 0 || height == 0 || image.width() == 0 {
        return output;
    }

    let sample_width = image.width().min(48).max(1);
    for y in 0..height {
        for x in 0..side_width {
            let pixel = match mode {
                "edge" | "microShadow" => {
                    let source_x = if side == "left" { 0 } else { image.width().saturating_sub(1) };
                    *image.get_pixel(source_x, y)
                }
                "mirror" => {
                    let offset = if side == "left" {
                        side_width.saturating_sub(1).saturating_sub(x)
                    } else {
                        x
                    };
                    let source_x = if side == "left" {
                        offset.min(sample_width.saturating_sub(1))
                    } else {
                        image.width().saturating_sub(1).saturating_sub(offset.min(sample_width.saturating_sub(1)))
                    };
                    *image.get_pixel(source_x, y)
                }
                "gradient" | "blur" => {
                    let t = if side_width <= 1 {
                        1.0
                    } else if side == "left" {
                        x as f32 / (side_width - 1) as f32
                    } else {
                        1.0 - (x as f32 / (side_width - 1) as f32)
                    };
                    let source_x = if side == "left" {
                        (x.min(sample_width.saturating_sub(1))).min(image.width().saturating_sub(1))
                    } else {
                        image.width().saturating_sub(1).saturating_sub(x.min(sample_width.saturating_sub(1)))
                    };
                    let edge = if mode == "blur" {
                        average_column_pixel(image, source_x, y, 10)
                    } else {
                        *image.get_pixel(source_x, y)
                    };
                    blend_pixel(Rgb([color.0, color.1, color.2]), edge, t)
                }
                _ => Rgb([color.0, color.1, color.2]),
            };
            output.put_pixel(x, y, pixel);
        }
    }
    output
}

fn overlay_image_signed(canvas: &mut RgbImage, image: &RgbImage, left: i32, top: i32) {
    for y in 0..image.height() {
        for x in 0..image.width() {
            let target_x = left + x as i32;
            let target_y = top + y as i32;
            if target_x >= 0
                && target_y >= 0
                && (target_x as u32) < canvas.width()
                && (target_y as u32) < canvas.height()
            {
                canvas.put_pixel(target_x as u32, target_y as u32, *image.get_pixel(x, y));
            }
        }
    }
}

fn blend_channel(source: u8, destination: u8, mode: &str) -> f32 {
    let source = source as f32 / 255.0;
    let destination = destination as f32 / 255.0;
    let value = match mode {
        "multiply" => source * destination,
        "screen" => source + destination - source * destination,
        "overlay" => {
            if destination <= 0.5 {
                2.0 * source * destination
            } else {
                1.0 - 2.0 * (1.0 - source) * (1.0 - destination)
            }
        }
        "darken" => source.min(destination),
        "lighten" => source.max(destination),
        _ => source,
    };
    value.clamp(0.0, 1.0)
}

fn overlay_rgba_signed(canvas: &mut RgbaImage, image: &RgbaImage, left: i32, top: i32, blend_mode: &str) {
    for y in 0..image.height() {
        for x in 0..image.width() {
            let target_x = left + x as i32;
            let target_y = top + y as i32;
            if target_x < 0
                || target_y < 0
                || (target_x as u32) >= canvas.width()
                || (target_y as u32) >= canvas.height()
            {
                continue;
            }

            let source = image.get_pixel(x, y).0;
            let destination = canvas.get_pixel(target_x as u32, target_y as u32).0;
            let source_alpha = source[3] as f32 / 255.0;
            if source_alpha <= 0.0 {
                continue;
            }
            let destination_alpha = destination[3] as f32 / 255.0;
            let out_alpha = source_alpha + destination_alpha * (1.0 - source_alpha);
            if out_alpha <= 0.0 {
                canvas.put_pixel(target_x as u32, target_y as u32, Rgba([0, 0, 0, 0]));
                continue;
            }

            let mut out = [0u8; 4];
            for channel in 0..3 {
                let blended = blend_channel(source[channel], destination[channel], blend_mode) * 255.0;
                let value = (blended * source_alpha * destination_alpha
                    + source[channel] as f32 * source_alpha * (1.0 - destination_alpha)
                    + destination[channel] as f32 * destination_alpha * (1.0 - source_alpha))
                    / out_alpha;
                out[channel] = value.round().clamp(0.0, 255.0) as u8;
            }
            out[3] = (out_alpha * 255.0).round().clamp(0.0, 255.0) as u8;
            canvas.put_pixel(target_x as u32, target_y as u32, Rgba(out));
        }
    }
}

fn flatten_rgba_image(image: &RgbaImage, background: (u8, u8, u8)) -> RgbImage {
    let (width, height) = image.dimensions();
    let mut output = RgbImage::new(width, height);
    for y in 0..height {
        for x in 0..width {
            let pixel = image.get_pixel(x, y).0;
            let alpha = pixel[3] as f32 / 255.0;
            let inv = 1.0 - alpha;
            let r = (pixel[0] as f32 * alpha + background.0 as f32 * inv).round() as u8;
            let g = (pixel[1] as f32 * alpha + background.1 as f32 * inv).round() as u8;
            let b = (pixel[2] as f32 * alpha + background.2 as f32 * inv).round() as u8;
            output.put_pixel(x, y, Rgb([r, g, b]));
        }
    }
    output
}

fn build_vertical_padding(
    image: &RgbImage,
    band_height: u32,
    side: &str,
    mode: &str,
    color: (u8, u8, u8),
    micro_shadow_percent: u8,
) -> RgbImage {
    let width = image.width();
    let mut output = RgbImage::from_pixel(width, band_height, Rgb([color.0, color.1, color.2]));
    if band_height == 0 || width == 0 || image.height() == 0 {
        return output;
    }

    let sample_height = image.height().min(48).max(1);
    for y in 0..band_height {
        for x in 0..width {
            let pixel = match mode {
                "microShadow" => {
                    let progress = if band_height <= 1 {
                        1.0
                    } else {
                        y as f32 / (band_height - 1) as f32
                    };
                    let t = smooth_step(progress);
                    let amount = normalize_micro_shadow_percent(micro_shadow_percent);
                    let source_y = if side == "top" { 0 } else { image.height().saturating_sub(1) };
                    let base = *image.get_pixel(x, source_y);
                    if side == "top" {
                        blend_pixel(darken_pixel(base, amount), base, t)
                    } else {
                        blend_pixel(base, lighten_pixel(base, amount), t)
                    }
                }
                "edge" => {
                    let source_y = if side == "top" { 0 } else { image.height().saturating_sub(1) };
                    *image.get_pixel(x, source_y)
                }
                "mirror" => {
                    let offset = if side == "top" {
                        band_height.saturating_sub(1).saturating_sub(y)
                    } else {
                        y
                    };
                    let source_y = if side == "top" {
                        offset.min(sample_height.saturating_sub(1))
                    } else {
                        image.height().saturating_sub(1).saturating_sub(offset.min(sample_height.saturating_sub(1)))
                    };
                    *image.get_pixel(x, source_y)
                }
                "gradient" | "blur" => {
                    let t = if band_height <= 1 {
                        1.0
                    } else if side == "top" {
                        y as f32 / (band_height - 1) as f32
                    } else {
                        1.0 - (y as f32 / (band_height - 1) as f32)
                    };
                    let source_y = if side == "top" {
                        y.min(sample_height.saturating_sub(1)).min(image.height().saturating_sub(1))
                    } else {
                        image.height().saturating_sub(1).saturating_sub(y.min(sample_height.saturating_sub(1)))
                    };
                    let edge = *image.get_pixel(x, source_y);
                    blend_pixel(Rgb([color.0, color.1, color.2]), edge, t)
                }
                _ => Rgb([color.0, color.1, color.2]),
            };
            output.put_pixel(x, y, pixel);
        }
    }
    output
}

fn render_row_with_side_padding(
    source: RgbImage,
    output_width: u32,
    padding: &SidePadding,
    fallback_color: (u8, u8, u8),
) -> Result<RgbImage, String> {
    let side_width = clamp_side_padding(padding, output_width);
    let side_crop = side_crop_for_padding(padding, output_width);
    let content_width = if side_crop > 0 {
        output_width.saturating_add(side_crop * 2)
    } else {
        output_width.saturating_sub(side_width * 2).max(1)
    };
    let resized = resize_to_width(source, content_width);
    let (top_value, bottom_value) = vertical_padding_values(padding);
    let top_pad = top_value.max(0) as u32;
    let bottom_pad = bottom_value.max(0) as u32;
    let top_crop = top_value
        .min(0)
        .unsigned_abs()
        .min(resized.height().saturating_sub(1));
    let bottom_crop = bottom_value
        .min(0)
        .unsigned_abs()
        .min(resized.height().saturating_sub(top_crop).saturating_sub(1));
    let visible_height = resized.height().saturating_sub(top_crop + bottom_crop).max(1);
    if side_width == 0 && side_crop == 0 && top_pad == 0 && bottom_pad == 0 && top_crop == 0 && bottom_crop == 0 {
        return Ok(resized);
    }
    let color = parse_hex_color(&padding.color).unwrap_or(fallback_color);
    let mut content = RgbImage::from_pixel(output_width, resized.height(), Rgb([color.0, color.1, color.2]));
    if side_width > 0 {
        let left = build_side_padding(&resized, side_width, "left", &padding.mode, color);
        let right = build_side_padding(&resized, side_width, "right", &padding.mode, color);
        overlay_image(&mut content, &left, 0, 0);
        overlay_image(&mut content, &right, side_width + resized.width(), 0);
    }
    if side_crop > 0 {
        overlay_image_signed(&mut content, &resized, -(side_crop as i32), 0);
    } else {
        overlay_image(&mut content, &resized, side_width, 0);
    }
    let visible_content = if top_crop > 0 || bottom_crop > 0 {
        imageops::crop_imm(&content, 0, top_crop, output_width, visible_height).to_image()
    } else {
        content
    };
    if top_pad == 0 && bottom_pad == 0 {
        return Ok(visible_content);
    }

    let mut row = RgbImage::from_pixel(
        output_width,
        visible_content.height() + top_pad + bottom_pad,
        Rgb([color.0, color.1, color.2]),
    );
    if top_pad > 0 {
        let top = build_vertical_padding(&visible_content, top_pad, "top", &padding.mode, color, padding.micro_shadow_percent);
        overlay_image(&mut row, &top, 0, 0);
    }
    overlay_image(&mut row, &visible_content, 0, top_pad);
    if bottom_pad > 0 {
        let bottom = build_vertical_padding(&visible_content, bottom_pad, "bottom", &padding.mode, color, padding.micro_shadow_percent);
        overlay_image(&mut row, &bottom, 0, top_pad + visible_content.height());
    }
    Ok(row)
}

fn render_export_rows(
    paths: &[String],
    side_paddings: &[SidePadding],
    background_rgb: (u8, u8, u8),
    output_width: u32,
) -> Result<Vec<RgbImage>, String> {
    let mut rows = Vec::new();
    for (index, raw) in paths.iter().enumerate() {
        let image = image::open(raw).map_err(|err| format!("read image failed: {err}"))?;
        let flattened = flatten_image(image, background_rgb);
        let padding = side_padding_for_index(side_paddings, index);
        rows.push(render_row_with_side_padding(
            flattened,
            output_width,
            &padding,
            background_rgb,
        )?);
    }
    Ok(rows)
}

fn build_spacing_gap(
    previous: &RgbImage,
    next: &RgbImage,
    spacing: u32,
    fill_mode: &str,
    spacing_rgb: (u8, u8, u8),
    micro_shadow_percent: u8,
) -> RgbImage {
    let width = previous.width().min(next.width());
    let mut gap = RgbImage::from_pixel(width, spacing, Rgb([spacing_rgb.0, spacing_rgb.1, spacing_rgb.2]));
    if spacing == 0 || width == 0 {
        return gap;
    }

    match fill_mode {
        "extend" => {
            let upper = (spacing + 1) / 2;
            let lower_start = upper;
            for x in 0..width {
                let top_pixel = *previous.get_pixel(x, previous.height().saturating_sub(1));
                let bottom_pixel = *next.get_pixel(x, 0);
                for y in 0..upper {
                    gap.put_pixel(x, y, top_pixel);
                }
                for y in lower_start..spacing {
                    gap.put_pixel(x, y, bottom_pixel);
                }
            }
        }
        "mirror" => {
            let upper = (spacing + 1) / 2;
            for x in 0..width {
                for y in 0..upper {
                    let source_y = previous.height().saturating_sub(1).saturating_sub(y.min(previous.height().saturating_sub(1)));
                    gap.put_pixel(x, y, *previous.get_pixel(x, source_y));
                }
                for y in upper..spacing {
                    let offset = y.saturating_sub(upper);
                    let source_y = offset.min(next.height().saturating_sub(1));
                    gap.put_pixel(x, y, *next.get_pixel(x, source_y));
                }
            }
        }
        "gradient" | "blur" => {
            let sample_height = if fill_mode == "blur" { 6 } else { 3 };
            for y in 0..spacing {
                let t = if spacing <= 1 {
                    0.5
                } else {
                    y as f32 / (spacing - 1) as f32
                };
                for x in 0..width {
                    let top_pixel = average_edge_pixel(
                        previous,
                        x,
                        previous.height().saturating_sub(1),
                        sample_height,
                    );
                    let bottom_pixel = average_edge_pixel(next, x, sample_height.saturating_sub(1), sample_height);
                    gap.put_pixel(x, y, blend_pixel(top_pixel, bottom_pixel, t));
                }
            }
        }
        "microShadow" => {
            let amount = normalize_micro_shadow_percent(micro_shadow_percent);
            let upper = ((spacing + 1) / 2).max(1);
            let lower = spacing.saturating_sub(upper).max(1);
            for y in 0..spacing {
                let is_upper = y < upper;
                let local = if is_upper {
                    if upper <= 1 { 1.0 } else { y as f32 / (upper - 1) as f32 }
                } else {
                    let offset = y.saturating_sub(upper);
                    if lower <= 1 { 0.0 } else { offset as f32 / (lower - 1) as f32 }
                };
                let t = smooth_step(local);
                for x in 0..width {
                    let base = if is_upper {
                        *previous.get_pixel(x, previous.height().saturating_sub(1))
                    } else {
                        *next.get_pixel(x, 0)
                    };
                    let pixel = if is_upper {
                        blend_pixel(base, lighten_pixel(base, amount), t)
                    } else {
                        blend_pixel(darken_pixel(base, amount), base, t)
                    };
                    gap.put_pixel(x, y, pixel);
                }
            }
        }
        _ => {}
    }

    gap
}

#[tauri::command]
fn save_stitched_image(
    paths: Vec<String>,
    side_paddings: Vec<SidePadding>,
    spacing: u32,
    spacing_color: String,
    spacing_fill_mode: Option<String>,
    spacing_micro_shadow_percent: Option<u8>,
    background_color: String,
    output_width: u32,
    output_path: String,
) -> Result<(), String> {
    if paths.is_empty() {
        return Err("没有可保存的图片".to_string());
    }
    if output_width == 0 {
        return Err("导出宽度无效".to_string());
    }

    let spacing_rgb = parse_hex_color(&spacing_color)?;
    let background_rgb = parse_hex_color(&background_color)?;
    let fill_mode = spacing_fill_mode.unwrap_or_else(|| "solid".to_string());
    let micro_shadow_percent = spacing_micro_shadow_percent.unwrap_or_else(default_micro_shadow_percent);
    let resized = render_export_rows(&paths, &side_paddings, background_rgb, output_width)?;
    let mut total_height = 0u64;

    for rgb in &resized {
        total_height += rgb.height() as u64;
    }

    total_height += spacing as u64 * (resized.len().saturating_sub(1) as u64);
    if total_height > u32::MAX as u64 {
        return Err("鏈€缁堥暱鍥捐繃楂橈紝鏃犳硶淇濆瓨".to_string());
    }

    let mut canvas = RgbImage::from_pixel(
        output_width,
        total_height as u32,
        Rgb([background_rgb.0, background_rgb.1, background_rgb.2]),
    );

    let mut top = 0u32;
    for (index, image) in resized.iter().enumerate() {
        for y in 0..image.height() {
            for x in 0..image.width() {
                let pixel = image.get_pixel(x, y);
                canvas.put_pixel(x, top + y, *pixel);
            }
        }
        top += image.height();
        if index < resized.len().saturating_sub(1) && spacing > 0 {
            let gap = build_spacing_gap(
                image,
                &resized[index + 1],
                spacing,
                &fill_mode,
                spacing_rgb,
                micro_shadow_percent,
            );
            for y in 0..gap.height() {
                for x in 0..gap.width() {
                    canvas.put_pixel(x, top + y, *gap.get_pixel(x, y));
                }
            }
            top += spacing;
        }
    }

    let output = PathBuf::from(output_path);
    if let Some(parent) = output.parent() {
        fs::create_dir_all(parent).map_err(|err| err.to_string())?;
    }
    let bytes = encode_jpeg(canvas)?;
    fs::write(output, bytes).map_err(|err| err.to_string())
}

#[tauri::command]
fn save_sliced_images(
    paths: Vec<String>,
    side_paddings: Vec<SidePadding>,
    spacing: u32,
    spacing_color: String,
    spacing_fill_mode: Option<String>,
    spacing_micro_shadow_percent: Option<u8>,
    background_color: String,
    output_width: u32,
    output_dir: String,
) -> Result<(), String> {
    if paths.is_empty() {
        return Err("没有可导出的图片".to_string());
    }
    if output_width == 0 {
        return Err("导出宽度无效".to_string());
    }

    let spacing_rgb = parse_hex_color(&spacing_color)?;
    let background_rgb = parse_hex_color(&background_color)?;
    let fill_mode = spacing_fill_mode.unwrap_or_else(|| "solid".to_string());
    let micro_shadow_percent = spacing_micro_shadow_percent.unwrap_or_else(default_micro_shadow_percent);
    let rows = render_export_rows(&paths, &side_paddings, background_rgb, output_width)?;
    let output_dir = PathBuf::from(output_dir).join("切片");
    fs::create_dir_all(&output_dir).map_err(|err| err.to_string())?;

    for (index, row) in rows.iter().enumerate() {
        let mut slice_height = row.height();
        let gap = if index < rows.len().saturating_sub(1) && spacing > 0 {
            let gap = build_spacing_gap(row, &rows[index + 1], spacing, &fill_mode, spacing_rgb, micro_shadow_percent);
            slice_height += gap.height();
            Some(gap)
        } else {
            None
        };
        let mut slice = RgbImage::from_pixel(
            output_width,
            slice_height,
            Rgb([background_rgb.0, background_rgb.1, background_rgb.2]),
        );
        overlay_image(&mut slice, row, 0, 0);
        if let Some(gap) = gap {
            overlay_image(&mut slice, &gap, 0, row.height());
        }
        let file_name = format!("切片_{}.jpg", index + 1);
        let bytes = encode_jpeg(slice)?;
        fs::write(output_dir.join(file_name), bytes).map_err(|err| err.to_string())?;
    }

    Ok(())
}

#[tauri::command]
fn save_layered_image(
    paths: Vec<String>,
    layer_transforms: Vec<LayerTransform>,
    layer_blend_modes: Vec<String>,
    background_color: String,
    output_width: u32,
    output_height: u32,
    output_path: String,
) -> Result<(), String> {
    if paths.is_empty() {
        return Err("没有可导出的图层".to_string());
    }
    if output_width == 0 || output_height == 0 {
        return Err("导出尺寸无效".to_string());
    }
    let background_rgb = parse_hex_color(&background_color)?;
    let mut canvas = RgbaImage::from_pixel(
        output_width,
        output_height,
        Rgba([0, 0, 0, 0]),
    );

    for (index, raw) in paths.iter().enumerate() {
        let image = image::open(raw).map_err(|err| format!("read layer failed: {err}"))?;
        let rgba = image.to_rgba8();
        let transform = layer_transforms.get(index).cloned().unwrap_or(LayerTransform {
            x: 0.0,
            y: 0.0,
            scale: 1.0,
            scale_x: None,
            scale_y: None,
        });
        let scale = transform.scale.max(0.01).min(20.0);
        let scale_x = transform.scale_x.unwrap_or(scale).max(0.01).min(20.0);
        let scale_y = transform.scale_y.unwrap_or(scale).max(0.01).min(20.0);
        let target_width = ((rgba.width() as f64 * scale_x).round() as u32).max(1);
        let target_height = ((rgba.height() as f64 * scale_y).round() as u32).max(1);
        let resized = DynamicImage::ImageRgba8(rgba)
            .resize_exact(target_width, target_height, FilterType::Lanczos3)
            .to_rgba8();
        let blend_mode = layer_blend_modes
            .get(index)
            .map(|value| value.as_str())
            .unwrap_or("normal");
        overlay_rgba_signed(
            &mut canvas,
            &resized,
            transform.x.round() as i32,
            transform.y.round() as i32,
            blend_mode,
        );
    }

    let output = PathBuf::from(output_path);
    if let Some(parent) = output.parent() {
        fs::create_dir_all(parent).map_err(|err| err.to_string())?;
    }
    let extension = output
        .extension()
        .and_then(|ext| ext.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    if extension == "jpg" || extension == "jpeg" {
        let flattened = flatten_rgba_image(&canvas, background_rgb);
        let bytes = encode_jpeg(flattened)?;
        fs::write(output, bytes).map_err(|err| err.to_string())
    } else {
        DynamicImage::ImageRgba8(canvas)
            .save(output)
            .map_err(|err| err.to_string())
    }
}

fn image_data_url_for_path(path: &str) -> Result<String, String> {
    let bytes = fs::read(path).map_err(|err| err.to_string())?;
    let mime = match Path::new(path)
        .extension()
        .and_then(|ext| ext.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase()
        .as_str()
    {
        "jpg" | "jpeg" => "image/jpeg",
        "png" => "image/png",
        "webp" => "image/webp",
        "bmp" => "image/bmp",
        "tif" | "tiff" => "image/tiff",
        _ => "application/octet-stream",
    };
    let encoded = {
        use base64::engine::general_purpose::STANDARD;
        use base64::Engine;
        STANDARD.encode(bytes)
    };
    Ok(format!("data:{mime};base64,{encoded}"))
}

async fn post_json(
    client: &Client,
    url: String,
    payload: serde_json::Value,
    api_key: Option<&str>,
) -> Result<serde_json::Value, String> {
    let mut request = client.post(&url).json(&payload);
    if let Some(key) = api_key {
        request = request.bearer_auth(key);
    }
    let response = request
        .send()
        .await
        .map_err(|err| friendly_request_error(err, &url))?;
    let status = response.status();
    let text = response.text().await.map_err(|err| err.to_string())?;
    if !status.is_success() {
        let lower = text.to_lowercase();
        if status.as_u16() == 401 {
            return Err("API Key 无效，或 Base URL 与 Key 不匹配。".to_string());
        }
        if status.as_u16() == 400
            && (lower.contains("model does not exist")
                || lower.contains("model_not_found")
                || lower.contains("model not found"))
        {
            return Err("模型名称错误，或当前账号不可用这个模型。".to_string());
        }
        if lower.contains("acl") || lower.contains("not allowed") {
            return Err("当前模型或接口不支持图片能力，请更换支持生图的模型。".to_string());
        }
        return Err(format!("API request failed: {status}\n{text}"));
    }
    serde_json::from_str(&text).map_err(|err| format!("API response format error: {err}"))
}

fn image_mime_for_path(path: &str) -> &'static str {
    match Path::new(path)
        .extension()
        .and_then(|ext| ext.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase()
        .as_str()
    {
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        "png" => "image/png",
        _ => "application/octet-stream",
    }
}

async fn post_image_edit(
    client: &Client,
    url: String,
    api: &ApiConfig,
    prompt: &str,
    image_size: &str,
    image_paths: &[String],
) -> Result<serde_json::Value, String> {
    let mut form = reqwest::multipart::Form::new()
        .text("model", api.model.trim().to_string())
        .text("prompt", prompt.to_string())
        .text("size", image_size.to_string())
        .text("n", "1".to_string());

    for path in image_paths.iter().filter(|path| !path.trim().is_empty()) {
        let bytes = fs::read(path).map_err(|err| format!("读取参考图失败：{err}"))?;
        let file_name = Path::new(path)
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("reference.png")
            .to_string();
        let part = reqwest::multipart::Part::bytes(bytes)
            .file_name(file_name)
            .mime_str(image_mime_for_path(path))
            .map_err(|err| format!("参考图格式无效：{err}"))?;
        form = form.part("image", part);
    }

    let response = client
        .post(&url)
        .bearer_auth(api.api_key.trim())
        .multipart(form)
        .send()
        .await
        .map_err(|err| friendly_request_error(err, &url))?;
    let status = response.status();
    let text = response.text().await.map_err(|err| err.to_string())?;
    if !status.is_success() {
        return Err(format!("API request failed: {status}\n{text}"));
    }
    serde_json::from_str(&text).map_err(|err| format!("API response format error: {err}"))
}

fn image_generation_url(api: &ApiConfig) -> Result<String, String> {
    let base = api.base_url.trim().trim_end_matches('/');
    if base.is_empty() {
        return Err("Base URL 涓虹┖".to_string());
    }
    Ok(format!("{base}/images/generations"))
}

fn image_edit_url(api: &ApiConfig) -> Result<String, String> {
    let base = api.base_url.trim().trim_end_matches('/');
    if base.is_empty() {
        return Err("Base URL 为空".to_string());
    }
    Ok(format!("{base}/images/edits"))
}

fn api_uses_openai_images(api: &ApiConfig) -> bool {
    let provider = api.provider.trim().to_lowercase();
    let base = api.base_url.trim().to_lowercase();
    provider == "openai"
        || provider.contains("openai")
        || base.contains("api.openai.com")
        || base.contains("easyrouter.io")
}

fn api_uses_easyrouter(api: &ApiConfig) -> bool {
    api.base_url.trim().to_lowercase().contains("easyrouter.io")
}

fn is_image_only_model(model: &str) -> bool {
    let normalized = model.trim().to_lowercase();
    normalized.starts_with("gpt-image-") || normalized.starts_with("dall-e-")
}

fn ensure_not_image_only_model(api: &ApiConfig, purpose: &str) -> Result<(), String> {
    if is_image_only_model(&api.model) {
        return Err(format!(
            "{purpose}不能使用出图模型 {}。请改用对话/视觉模型，例如 gpt-4o、gpt-4o-mini、gpt-4.1 或 EasyRouter 支持的 gpt-5.4。",
            api.model.trim()
        ));
    }
    Ok(())
}

fn responses_url(api: &ApiConfig) -> Result<String, String> {
    let base = api.base_url.trim().trim_end_matches('/');
    if base.is_empty() {
        return Err("Base URL 为空".to_string());
    }
    Ok(format!("{base}/responses"))
}

fn response_text_from_responses(result: &serde_json::Value) -> Option<String> {
    if let Some(text) = result.get("output_text").and_then(|value| value.as_str()) {
        if !text.trim().is_empty() {
            return Some(text.to_string());
        }
    }
    result
        .get("output")
        .and_then(|value| value.as_array())
        .and_then(|items| {
            for item in items {
                if let Some(content) = item.get("content").and_then(|value| value.as_array()) {
                    for part in content {
                        if let Some(text) = part.get("text").and_then(|value| value.as_str()) {
                            if !text.trim().is_empty() {
                                return Some(text.to_string());
                            }
                        }
                    }
                }
            }
            None
        })
}

fn http_client() -> Result<Client, String> {
    Client::builder()
        .timeout(Duration::from_secs(300))
        .build()
        .map_err(|err| format!("HTTP 客户端初始化失败：{err}"))
}

fn update_http_client() -> Result<Client, String> {
    Client::builder()
        .no_proxy()
        .timeout(Duration::from_secs(60))
        .build()
        .map_err(|err| format!("更新客户端初始化失败：{err}"))
}

fn friendly_request_error(err: reqwest::Error, url: &str) -> String {
    if err.is_timeout() {
        return format!("请求超时：调用接口超过 300 秒仍未成功，已终止任务。接口：{url}");
    }
    if err.is_connect() || err.is_timeout() || err.is_request() {
        format!(
            "网络请求发送失败：{err}\n请检查当前电脑是否能访问 {url}，以及系统代理/VPN 是否已开启。"
        )
    } else {
        err.to_string()
    }
}

fn masked_api_key(api_key: &str) -> String {
    let key = api_key.trim();
    let chars: Vec<char> = key.chars().collect();
    if chars.len() <= 10 {
        return "******".to_string();
    }
    let prefix: String = chars.iter().take(6).collect();
    let suffix: String = chars.iter().skip(chars.len().saturating_sub(4)).collect();
    format!("{prefix}...{suffix}")
}

fn log_image_generation_request(request_url: &str, api: &ApiConfig, image_size: &str) {
    println!(
        "SiliconFlow image request debug => requestUrl: {}, model: {}, image_size: {}, apiKey: {}",
        request_url,
        api.model.trim(),
        image_size,
        masked_api_key(&api.api_key)
    );
}

fn image_generation_payload(api: &ApiConfig, prompt: &str, image_size: &str) -> serde_json::Value {
    if api_uses_openai_images(api) {
        serde_json::json!({
            "model": api.model.trim(),
            "prompt": prompt,
            "size": image_size,
            "n": 1
        })
    } else {
        serde_json::json!({
            "model": api.model.trim(),
            "prompt": prompt,
            "image_size": image_size,
            "batch_size": 1,
            "num_inference_steps": 20,
            "guidance_scale": 7.5
        })
    }
}

fn requested_image_size_for_target(api: &ApiConfig, target_size: Option<(u32, u32)>) -> String {
    let Some((target_width, target_height)) = target_size else {
        return "1024x1024".to_string();
    };
    if target_width == 0 || target_height == 0 {
        return "1024x1024".to_string();
    }

    let aspect = target_width as f64 / target_height as f64;
    let model = api.model.trim().to_ascii_lowercase();
    if api_uses_easyrouter(api) && model.contains("gpt-image-2") {
        if aspect < 0.65 {
            return "1024x1792".to_string();
        }
        if aspect > 1.55 {
            return "1792x1024".to_string();
        }
    }
    if model.contains("dall-e-3") {
        if aspect < 0.8 {
            "1024x1792".to_string()
        } else if aspect > 1.25 {
            "1792x1024".to_string()
        } else {
            "1024x1024".to_string()
        }
    } else if aspect < 0.85 {
        "1024x1536".to_string()
    } else if aspect > 1.18 {
        "1536x1024".to_string()
    } else {
        "1024x1024".to_string()
    }
}

fn fallback_image_size_for_target(api: &ApiConfig, image_size: &str, target_size: Option<(u32, u32)>) -> Option<String> {
    if !api_uses_openai_images(api) {
        return None;
    }
    let Some((target_width, target_height)) = target_size else {
        return None;
    };
    if target_width == 0 || target_height == 0 {
        return None;
    }
    let aspect = target_width as f64 / target_height as f64;
    let fallback = if aspect < 0.85 {
        "1024x1536"
    } else if aspect > 1.18 {
        "1536x1024"
    } else {
        "1024x1024"
    };
    if fallback == image_size {
        None
    } else {
        Some(fallback.to_string())
    }
}

fn is_image_size_error(message: &str) -> bool {
    let lower = message.to_ascii_lowercase();
    lower.contains("size")
        || lower.contains("unsupported")
        || lower.contains("invalid")
        || lower.contains("param")
}

fn model_image_token_prices_usd(model: &str) -> Option<(f64, f64)> {
    let normalized = model.trim().to_lowercase();
    if normalized.starts_with("gpt-image-2") {
        Some((5.0, 30.0))
    } else {
        None
    }
}

fn usage_token_count(usage: &serde_json::Value, key: &str) -> Option<u64> {
    usage
        .get(key)
        .and_then(|value| value.as_u64().or_else(|| value.as_f64().map(|number| number.round() as u64)))
}

fn number_at_path(value: &serde_json::Value, path: &[&str]) -> Option<f64> {
    let mut current = value;
    for key in path {
        current = current.get(*key)?;
    }
    current
        .as_f64()
        .or_else(|| current.as_u64().map(|number| number as f64))
        .or_else(|| current.as_str().and_then(|text| text.trim().parse::<f64>().ok()))
}

fn response_cost_amount(result: &serde_json::Value) -> Option<f64> {
    [
        &["cost"][..],
        &["cost_usd"][..],
        &["total_cost"][..],
        &["usage", "cost"][..],
        &["usage", "cost_usd"][..],
        &["usage", "total_cost"][..],
        &["billing", "cost"][..],
        &["billing", "total_cost"][..],
    ]
    .iter()
    .find_map(|path| number_at_path(result, path))
}

fn response_cost_currency(result: &serde_json::Value) -> String {
    for path in [
        &["currency"][..],
        &["usage", "currency"][..],
        &["billing", "currency"][..],
    ] {
        let mut current = result;
        let mut found = true;
        for key in path {
            if let Some(next) = current.get(*key) {
                current = next;
            } else {
                found = false;
                break;
            }
        }
        if found {
            if let Some(text) = current.as_str() {
                if !text.trim().is_empty() {
                    return text.trim().to_uppercase();
                }
            }
        }
    }
    "USD".to_string()
}

fn api_cost_details(api: &ApiConfig, result: &serde_json::Value) -> (String, Option<f64>, String, String) {
    if let Some(amount) = response_cost_amount(result) {
        let currency = response_cost_currency(result);
        let summary = format!("费用 {currency} {amount:.6}");
        return (summary, Some(amount), currency, String::new());
    }
    let Some(usage) = result.get("usage") else {
        return ("费用：接口未返回费用或用量，无法估算".to_string(), None, String::new(), String::new());
    };
    let input_tokens = usage_token_count(usage, "input_tokens").unwrap_or(0);
    let output_tokens = usage_token_count(usage, "output_tokens").unwrap_or(0);
    let total_tokens = usage_token_count(usage, "total_tokens").unwrap_or(input_tokens + output_tokens);
    let usage_text = format!("输入 {input_tokens} / 输出 {output_tokens} / 总计 {total_tokens} tokens");
    let Some((input_price, output_price)) = model_image_token_prices_usd(&api.model) else {
        return (format!("用量：{usage_text}"), None, String::new(), usage_text);
    };
    let cost = (input_tokens as f64 * input_price + output_tokens as f64 * output_price) / 1_000_000.0;
    (format!("预估费用 USD {cost:.6}，{usage_text}"), Some(cost), "USD".to_string(), usage_text)
}

fn image_generation_cost_details(api: &ApiConfig, result: &serde_json::Value) -> (String, Option<f64>, String, String) {
    if !api_uses_openai_images(api) {
        return (String::new(), None, String::new(), String::new());
    }
    api_cost_details(api, result)
}

fn is_near_white(pixel: &image::Rgba<u8>) -> bool {
    pixel[0] >= 246 && pixel[1] >= 246 && pixel[2] >= 246 && pixel[3] >= 245
}

fn trim_near_white_border(image: DynamicImage) -> DynamicImage {
    let rgba = image.to_rgba8();
    let (width, height) = rgba.dimensions();
    if width < 16 || height < 16 {
        return DynamicImage::ImageRgba8(rgba);
    }

    let mut min_x = width;
    let mut min_y = height;
    let mut max_x = 0;
    let mut max_y = 0;
    for y in 0..height {
        for x in 0..width {
            let pixel = rgba.get_pixel(x, y);
            if !is_near_white(pixel) {
                min_x = min_x.min(x);
                min_y = min_y.min(y);
                max_x = max_x.max(x);
                max_y = max_y.max(y);
            }
        }
    }

    if min_x >= width || min_y >= height {
        return DynamicImage::ImageRgba8(rgba);
    }

    let crop_width = max_x - min_x + 1;
    let crop_height = max_y - min_y + 1;
    let removed_x = width.saturating_sub(crop_width);
    let removed_y = height.saturating_sub(crop_height);
    if removed_x < 8 && removed_y < 8 {
        return DynamicImage::ImageRgba8(rgba);
    }

    let pad_x = (crop_width as f32 * 0.015).round() as u32;
    let pad_y = (crop_height as f32 * 0.015).round() as u32;
    let left = min_x.saturating_sub(pad_x);
    let top = min_y.saturating_sub(pad_y);
    let right = (max_x + pad_x).min(width - 1);
    let bottom = (max_y + pad_y).min(height - 1);
    DynamicImage::ImageRgba8(rgba).crop_imm(left, top, right - left + 1, bottom - top + 1)
}

fn average_edge_color_rgba(image: &RgbaImage) -> Rgba<u8> {
    let (width, height) = image.dimensions();
    if width == 0 || height == 0 {
        return Rgba([255, 255, 255, 255]);
    }

    let mut sum = [0u64; 4];
    let mut count = 0u64;
    for x in 0..width {
        for y in [0, height - 1] {
            let pixel = image.get_pixel(x, y).0;
            for channel in 0..4 {
                sum[channel] += pixel[channel] as u64;
            }
            count += 1;
        }
    }
    for y in 0..height {
        for x in [0, width - 1] {
            let pixel = image.get_pixel(x, y).0;
            for channel in 0..4 {
                sum[channel] += pixel[channel] as u64;
            }
            count += 1;
        }
    }

    if count == 0 {
        return Rgba([255, 255, 255, 255]);
    }
    Rgba([
        (sum[0] / count) as u8,
        (sum[1] / count) as u8,
        (sum[2] / count) as u8,
        255,
    ])
}

fn fit_to_target_canvas(image: DynamicImage, target_size: Option<(u32, u32)>) -> DynamicImage {
    let Some((target_width, target_height)) = target_size else {
        return image;
    };
    if target_width == 0 || target_height == 0 {
        return image;
    }

    let rgba = image.to_rgba8();
    let (width, height) = rgba.dimensions();
    if width == 0 || height == 0 {
        return DynamicImage::ImageRgba8(rgba);
    }

    let scale = (target_width as f64 / width as f64).min(target_height as f64 / height as f64);
    let resized_width = ((width as f64 * scale).round() as u32).clamp(1, target_width);
    let resized_height = ((height as f64 * scale).round() as u32).clamp(1, target_height);
    let resized = DynamicImage::ImageRgba8(rgba.clone())
        .resize_exact(resized_width, resized_height, FilterType::Lanczos3)
        .to_rgba8();

    let cover_scale = (target_width as f64 / width as f64).max(target_height as f64 / height as f64);
    let cover_width = ((width as f64 * cover_scale).round() as u32).max(target_width);
    let cover_height = ((height as f64 * cover_scale).round() as u32).max(target_height);
    let cover = DynamicImage::ImageRgba8(rgba)
        .resize_exact(cover_width, cover_height, FilterType::Lanczos3)
        .blur(18.0)
        .to_rgba8();
    let mut canvas = RgbaImage::from_pixel(target_width, target_height, average_edge_color_rgba(&cover));
    let cover_left = -((cover_width.saturating_sub(target_width) / 2) as i32);
    let cover_top = -((cover_height.saturating_sub(target_height) / 2) as i32);
    overlay_rgba_signed(&mut canvas, &cover, cover_left, cover_top, "normal");

    let left = target_width.saturating_sub(resized_width) / 2;
    let top = target_height.saturating_sub(resized_height) / 2;
    overlay_rgba_signed(&mut canvas, &resized, left as i32, top as i32, "normal");
    DynamicImage::ImageRgba8(canvas)
}

fn normalize_generated_template_image(
    image: DynamicImage,
    target_size: Option<(u32, u32)>,
) -> DynamicImage {
    fit_to_target_canvas(image, target_size)
}

async fn save_generated_image_from_response(
    client: &Client,
    result: serde_json::Value,
    target_size: Option<(u32, u32)>,
) -> Result<String, String> {
    let first = result
        .pointer("/data/0")
        .ok_or_else(|| "鐢熷浘 API 杩斿洖缁撴灉涓虹┖鎴栫己灏?data[0]".to_string())?;

    let bytes = if let Some(url) = first.get("url").and_then(|value| value.as_str()) {
        let response = client
            .get(url)
            .send()
            .await
            .map_err(|err| friendly_request_error(err, url))?;
        let status = response.status();
        if !status.is_success() {
            let text = response.text().await.unwrap_or_default();
            return Err(format!("download generated image failed: {status}\n{text}"));
        }
        response.bytes().await.map_err(|err| err.to_string())?.to_vec()
    } else if let Some(encoded) = first
        .get("b64_json")
        .or_else(|| first.get("base64"))
        .and_then(|value| value.as_str())
    {
        use base64::engine::general_purpose::STANDARD;
        use base64::Engine;
        STANDARD.decode(encoded).map_err(|err| err.to_string())?
    } else {
        return Err("鐢熷浘 API 杩斿洖缁撴灉缂哄皯 url 鎴?b64_json".to_string());
    };

    let image = image::load_from_memory(&bytes).map_err(|err| format!("read generated image failed: {err}"))?;
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|err| err.to_string())?
        .as_millis();
    let dir = std::env::temp_dir().join(APP_NAME).join("templates");
    fs::create_dir_all(&dir).map_err(|err| err.to_string())?;
    let output = dir.join(format!("template_{timestamp}.png"));
    let processed = normalize_generated_template_image(image, target_size);
    processed.save(&output).map_err(|err| err.to_string())?;
    Ok(output.to_string_lossy().to_string())
}

async fn request_image_generation(
    api: &ApiConfig,
    prompt: &str,
    target_size: Option<(u32, u32)>,
    reference_paths: Vec<String>,
) -> Result<TemplateImageResult, String> {
    if api.api_key.trim().is_empty() {
        return Err("API Key 涓虹┖".to_string());
    }
    if api.model.trim().is_empty() {
        return Err("妯″瀷鍚嶇О涓虹┖".to_string());
    }
    let client = http_client()?;
    let image_size = requested_image_size_for_target(api, target_size);
    let result = if api_uses_openai_images(api) && !reference_paths.is_empty() {
        let request_url = image_edit_url(api)?;
        log_image_generation_request(&request_url, api, &image_size);
        match post_image_edit(&client, request_url.clone(), api, prompt, &image_size, &reference_paths).await {
            Ok(result) => result,
            Err(err) => {
                if let Some(fallback_size) = fallback_image_size_for_target(api, &image_size, target_size) {
                    if is_image_size_error(&err) {
                        log_image_generation_request(&request_url, api, &fallback_size);
                        post_image_edit(&client, request_url, api, prompt, &fallback_size, &reference_paths).await?
                    } else {
                        return Err(err);
                    }
                } else {
                    return Err(err);
                }
            }
        }
    } else {
        let request_url = image_generation_url(api)?;
        log_image_generation_request(&request_url, api, &image_size);
        let payload = image_generation_payload(api, prompt, &image_size);
        match post_json(&client, request_url.clone(), payload, Some(&api.api_key)).await {
            Ok(result) => result,
            Err(err) => {
                if let Some(fallback_size) = fallback_image_size_for_target(api, &image_size, target_size) {
                    if is_image_size_error(&err) {
                        log_image_generation_request(&request_url, api, &fallback_size);
                        let payload = image_generation_payload(api, prompt, &fallback_size);
                        post_json(&client, request_url, payload, Some(&api.api_key)).await?
                    } else {
                        return Err(err);
                    }
                } else {
                    return Err(err);
                }
            }
        }
    };
    let (cost_summary, cost_amount, cost_currency, usage_summary) = image_generation_cost_details(api, &result);
    let path = save_generated_image_from_response(&client, result, target_size).await?;
    Ok(TemplateImageResult {
        path,
        cost_summary,
        cost_amount,
        cost_currency,
        usage_summary,
    })
}

#[tauri::command]
async fn test_image_api_connection(api: ApiConfig) -> Result<(), String> {
    if api.api_key.trim().is_empty() {
        return Err("API Key 涓虹┖".to_string());
    }
    if api.base_url.trim().is_empty() {
        return Err("Base URL 涓虹┖".to_string());
    }
    if api.model.trim().is_empty() {
        return Err("妯″瀷鍚嶇О涓虹┖".to_string());
    }
    let client = http_client()?;
    let request_url = image_generation_url(&api)?;
    let image_size = "1024x1024";
    log_image_generation_request(&request_url, &api, image_size);
    let payload = image_generation_payload(
        &api,
        "涓€寮犵數鍟嗕富鍥撅紝娴呰壊鑳屾櫙锛屼骇鍝佸眳涓睍绀猴紝楂樻竻鍟嗕笟鎽勫奖椋庢牸",
        image_size,
    );
    post_json(&client, request_url, payload, Some(&api.api_key)).await?;
    Ok(())
}

#[tauri::command]
async fn test_api_connection(api: ApiConfig) -> Result<(), String> {
    if api.api_key.trim().is_empty() {
        return Err("API Key 涓虹┖".to_string());
    }
    if api.base_url.trim().is_empty() {
        return Err("Base URL 涓虹┖".to_string());
    }
    if api.model.trim().is_empty() {
        return Err("妯″瀷鍚嶇О涓虹┖".to_string());
    }
    ensure_not_image_only_model(&api, "提示词/OCR API")?;

    let client = http_client()?;
    if api.provider == "Gemini" {
        let url = format!(
            "{}/v1beta/models/{}:generateContent?key={}",
            api.base_url.trim_end_matches('/'),
            api.model,
            api.api_key
        );
        let payload = serde_json::json!({
            "contents": [{"parts": [{"text": "ping"}]}],
            "generationConfig": {"temperature": 0, "maxOutputTokens": 8}
        });
        post_json(&client, url, payload, None).await?;
    } else if api_uses_easyrouter(&api) {
        let url = responses_url(&api)?;
        let payload = serde_json::json!({
            "model": api.model,
            "input": "ping",
            "temperature": 0,
            "max_output_tokens": 8
        });
        post_json(&client, url, payload, Some(&api.api_key)).await?;
    } else {
        let url = format!("{}/chat/completions", api.base_url.trim_end_matches('/'));
        let payload = serde_json::json!({
            "model": api.model,
            "messages": [{"role": "user", "content": "ping"}],
            "max_tokens": 8,
            "temperature": 0
        });
        post_json(&client, url, payload, Some(&api.api_key)).await?;
    }
    Ok(())
}

#[tauri::command]
fn export_text_file(path: String, content: String) -> Result<(), String> {
    fs::write(path, content).map_err(|err| err.to_string())
}

#[tauri::command]
async fn generate_prompt(path: String, api: ApiConfig, instruction: Option<String>) -> Result<PromptApiResult, String> {
    if api.api_key.trim().is_empty() {
        return Err("API Key 涓虹┖".to_string());
    }
    ensure_not_image_only_model(&api, "提示词 API")?;

    let instruction_text = instruction
        .unwrap_or_else(|| "Describe this ecommerce image in detail for prompt extraction.".to_string())
        .trim()
        .to_string();
    let instruction_text = if instruction_text.is_empty() {
        "Describe this ecommerce image in detail for prompt extraction.".to_string()
    } else {
        instruction_text
    };
    let entry = to_image_entry(Path::new(&path))?;
    let data_url = image_data_url_for_path(&path)?;
    let client = http_client()?;
    let image_prompt = format!(
        "{}\n\nUser instruction: {}\n\nAnalyze this image. File name: {}, size: {}x{}px.",
        VISION_SYSTEM_PROMPT, instruction_text, entry.name, entry.width, entry.height
    );

    if api.provider == "Gemini" {
        let (_, encoded) = data_url
            .split_once(',')
            .ok_or_else(|| "鍥剧墖缂栫爜澶辫触".to_string())?;
        let mime = data_url
            .trim_start_matches("data:")
            .split_once(';')
            .map(|value| value.0)
            .unwrap_or("image/png");
        let url = format!(
            "{}/v1beta/models/{}:generateContent?key={}",
            api.base_url.trim_end_matches('/'),
            api.model,
            api.api_key
        );
        let payload = serde_json::json!({
            "contents": [{
                "parts": [
                    {"text": image_prompt},
                    {"inline_data": {"mime_type": mime, "data": encoded}}
                ]
            }],
            "generationConfig": {"temperature": 0.2}
        });
        let result = post_json(&client, url, payload, None).await?;
        let text = result
            .pointer("/candidates/0/content/parts/0/text")
            .and_then(|value| value.as_str())
            .map(|value| value.to_string())
            .ok_or_else(|| "Gemini 杩斿洖缁撴灉涓虹┖鎴栨牸寮忎笉绗﹀悎棰勬湡".to_string())?;
        let (cost_summary, cost_amount, cost_currency, usage_summary) = api_cost_details(&api, &result);
        return Ok(PromptApiResult {
            text,
            cost_summary,
            cost_amount,
            cost_currency,
            usage_summary,
        });
    }

    if api_uses_easyrouter(&api) {
        let url = responses_url(&api)?;
        let payload = serde_json::json!({
            "model": api.model,
            "temperature": 0.2,
            "input": [{
                "role": "user",
                "content": [
                    {"type": "input_text", "text": image_prompt},
                    {"type": "input_image", "image_url": data_url}
                ]
            }]
        });
        let result = post_json(&client, url, payload, Some(&api.api_key)).await?;
        let text = response_text_from_responses(&result)
            .ok_or_else(|| "模型返回结果为空或格式不符合预期".to_string())?;
        let (cost_summary, cost_amount, cost_currency, usage_summary) = api_cost_details(&api, &result);
        return Ok(PromptApiResult {
            text,
            cost_summary,
            cost_amount,
            cost_currency,
            usage_summary,
        });
    }

    let url = format!("{}/chat/completions", api.base_url.trim_end_matches('/'));
    let payload = serde_json::json!({
        "model": api.model,
        "temperature": 0.2,
        "messages": [{
            "role": "user",
            "content": [
                {"type": "text", "text": image_prompt},
                {"type": "image_url", "image_url": {"url": data_url}}
            ]
        }]
    });
    let result = post_json(&client, url, payload, Some(&api.api_key)).await?;
    let text = result
        .pointer("/choices/0/message/content")
        .and_then(|value| value.as_str())
        .map(|value| value.to_string())
        .ok_or_else(|| "妯″瀷杩斿洖缁撴灉涓虹┖鎴栨牸寮忎笉绗﹀悎棰勬湡".to_string())?;
    let (cost_summary, cost_amount, cost_currency, usage_summary) = api_cost_details(&api, &result);
    Ok(PromptApiResult {
        text,
        cost_summary,
        cost_amount,
        cost_currency,
        usage_summary,
    })
}

#[tauri::command]
async fn ocr_image_text_with_api(path: String, api: ApiConfig) -> Result<OcrTextResult, String> {
    if api.api_key.trim().is_empty() {
        return Err("API Key 涓虹┖".to_string());
    }
    if api.base_url.trim().is_empty() {
        return Err("Base URL 涓虹┖".to_string());
    }
    if api.model.trim().is_empty() {
        return Err("妯″瀷鍚嶇О涓虹┖".to_string());
    }
    ensure_not_image_only_model(&api, "极限词 OCR API")?;

    let entry = to_image_entry(Path::new(&path))?;
    let data_url = image_data_url_for_path(&path)?;
    let client = http_client()?;
    let ocr_prompt = format!(
        "Extract only visible OCR text from this image, one line per text block. Do not explain. File name: {}, size: {}x{}px.",
        entry.name, entry.width, entry.height
    );

    let text = if api.provider == "Gemini" {
        let (_, encoded) = data_url
            .split_once(',')
            .ok_or_else(|| "鍥剧墖缂栫爜澶辫触".to_string())?;
        let mime = data_url
            .trim_start_matches("data:")
            .split_once(';')
            .map(|value| value.0)
            .unwrap_or("image/png");
        let url = format!(
            "{}/v1beta/models/{}:generateContent?key={}",
            api.base_url.trim_end_matches('/'),
            api.model,
            api.api_key
        );
        let payload = serde_json::json!({
            "contents": [{
                "parts": [
                    {"text": ocr_prompt},
                    {"inline_data": {"mime_type": mime, "data": encoded}}
                ]
            }],
            "generationConfig": {"temperature": 0, "maxOutputTokens": 4096}
        });
        let result = post_json(&client, url, payload, None).await?;
        result
            .pointer("/candidates/0/content/parts/0/text")
            .and_then(|value| value.as_str())
            .map(|value| value.to_string())
            .ok_or_else(|| "Gemini OCR 返回结果为空或格式不符合预期".to_string())?
    } else if api_uses_easyrouter(&api) {
        let url = responses_url(&api)?;
        let payload = serde_json::json!({
            "model": api.model,
            "temperature": 0,
            "input": [{
                "role": "user",
                "content": [
                    {"type": "input_text", "text": ocr_prompt},
                    {"type": "input_image", "image_url": data_url}
                ]
            }],
            "max_output_tokens": 4096
        });
        let result = post_json(&client, url, payload, Some(&api.api_key)).await?;
        response_text_from_responses(&result)
            .ok_or_else(|| "模型 OCR 返回结果为空或格式不符合预期".to_string())?
    } else {
        let url = format!("{}/chat/completions", api.base_url.trim_end_matches('/'));
        let payload = serde_json::json!({
            "model": api.model,
            "temperature": 0,
            "messages": [{
                "role": "user",
                "content": [
                    {"type": "text", "text": ocr_prompt},
                    {"type": "image_url", "image_url": {"url": data_url}}
                ]
            }]
        });
        let result = post_json(&client, url, payload, Some(&api.api_key)).await?;
        result
            .pointer("/choices/0/message/content")
            .and_then(|value| value.as_str())
            .map(|value| value.to_string())
            .ok_or_else(|| "模型 OCR 返回结果为空或格式不符合预期".to_string())?
    };

    Ok(OcrTextResult { text })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            collect_image_entries,
            read_image_data_url,
            save_pasted_image,
            generate_template_image,
            load_config,
            save_config,
            fetch_update_manifest,
            download_update_file,
            open_target_folder,
            save_stitched_image,
            save_sliced_images,
            save_layered_image,
            ocr_image_text,
            ocr_image_text_with_api,
            export_text_file,
            generate_prompt,
            test_image_api_connection,
            test_api_connection
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

