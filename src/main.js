import { invoke } from "@tauri-apps/api/core";
import { pictureDir, join } from "@tauri-apps/api/path";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open, save } from "@tauri-apps/plugin-dialog";
import commonShopHeaderUrl from "./assets/1688-common-shop-header.jpg";
import { DEFAULT_RISK_LEXICON } from "./riskLexiconPreset.js";

const SUPPORTED_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "bmp", "tif", "tiff"]);
const DEFAULT_COLOR = "#FFFFFF";
const DEFAULT_SPACING_FILL_MODE = "gradient";
const DEFAULT_SIDE_PADDING_MODE = "gradient";
const DEFAULT_MICRO_SHADOW_PERCENT = 8;
const SIDE_PADDING_MODES = ["solid", "edge", "gradient", "blur", "mirror", "microShadow"];
const DEFAULT_LAYER_BLEND_MODE = "normal";
const DEFAULT_STROKE_ALIGN = "center";
const STROKE_ALIGN_OPTIONS = [
  { value: "center", label: "描边" },
  { value: "inner", label: "内描边" },
  { value: "outer", label: "外描边" }
];
const SNAP_THRESHOLD = 10;
const SNAP_GUIDE_COLOR = "#c000ff";
const MIN_LAYER_WIDTH = 20;
const MIN_LAYER_HEIGHT = 20;
const LAYER_BLEND_MODES = [
  { value: "normal", label: "正常", css: "normal" },
  { value: "multiply", label: "正片叠底", css: "multiply" },
  { value: "screen", label: "滤色", css: "screen" },
  { value: "overlay", label: "叠加", css: "overlay" },
  { value: "darken", label: "变暗", css: "darken" },
  { value: "lighten", label: "变亮", css: "lighten" }
];
const DEFAULT_OUTPUT_NAME = "拼接长图.jpg";
const MIN_ZOOM = 0.3;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.1;
const LAYER_HISTORY_LIMIT = 40;
const SORT_AUTO_SCROLL_EDGE = 72;
const SORT_AUTO_SCROLL_MAX_SPEED = 18;
const SORT_DRAG_THRESHOLD = 4;
const RISK_LEXICON_STORAGE_KEY = "image-slicer-risk-lexicon-v1";
const RISK_LEXICON_PRESET_VERSION_KEY = "image-slicer-risk-lexicon-preset-version";
const RISK_LEXICON_PRESET_VERSION = "2026-06-05-curated-imported";
const PRODUCT_IMAGES_STORAGE_KEY = "image-slicer-product-images-v1";
const PROMPT_TEMPLATE_STORAGE_KEY = "image-slicer-prompt-template-v1";
const COST_LEDGER_STORAGE_KEY = "image-slicer-cost-ledger-v1";
const API_TASK_TIMEOUT_MS = 300000;
const TEMPLATE_ASPECT_OPTIONS = [
  { value: "auto", label: "自动匹配" },
  { value: "1:1", label: "1:1 方图" },
  { value: "3:4", label: "3:4 竖图" },
  { value: "4:3", label: "4:3 横图" },
  { value: "2:3", label: "2:3 竖图" },
  { value: "3:2", label: "3:2 横图" },
  { value: "9:16", label: "9:16 竖图" },
  { value: "16:9", label: "16:9 横图" },
  { value: "4:5", label: "4:5 竖图" },
  { value: "5:4", label: "5:4 横图" },
  { value: "1:2", label: "1:2 长图" },
  { value: "2:1", label: "2:1 宽图" }
];
const CURRENT_APP_VERSION = "1.0.36";
const TEXT_LAYER_DEFAULT_TEXT = "请输入文字";
const FONT_OPTIONS = [
  "思源黑体",
  "思源宋体",
  "思源柔黑",
  "思源真黑",
  "阿里妈妈方圆体",
  "阿里妈妈东方大楷",
  "阿里妈妈数黑体",
  "Microsoft YaHei",
  "SimHei",
  "SimSun",
  "Arial",
  "Helvetica",
  "Times New Roman"
];
const FONT_WEIGHT_OPTIONS = [
  { value: 300, label: "细体" },
  { value: 400, label: "常规" },
  { value: 500, label: "中等" },
  { value: 600, label: "半粗" },
  { value: 700, label: "粗体" },
  { value: 800, label: "特粗" }
];
const DEFAULT_UPDATE_MANIFEST_URL = "http://192.192.3.180:8080/latest.json";
const DEFAULT_EXTRACT_PROMPT = "请提取图片文生图信息，详细描述画面风格、元素、内容细节、文字、构图、色彩与光影，输出可用于复刻参考图的完整提示词。";
const LEGACY_EXTRACT_PROMPT = "提取图片文生图信息";

const PROVIDERS = {
  Gemini: {
    base_url: "https://generativelanguage.googleapis.com",
    model: "gemini-1.5-flash",
    hint: "Gemini vision model."
  },
  OpenAI: {
    base_url: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
    imageModel: "gpt-image-1",
    hint: "OpenAI vision-compatible model."
  },
  "通义千问 / Qwen": {
    base_url: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    model: "qwen-vl-plus",
    hint: "Qwen vision-compatible endpoint."
  },
  "智谱 GLM": {
    base_url: "https://open.bigmodel.cn/api/paas/v4",
    model: "glm-4v",
    hint: "GLM vision-compatible endpoint."
  },
  "自定义 OpenAI 兼容接口": {
    base_url: "",
    model: "",
    hint: "Custom OpenAI-compatible endpoint. EasyRouter 提示词/OCR 用 /responses 的对话视觉模型；生图用 /images/generations 或 /images/edits。"
  }
};

const DEFAULT_PROMPT_API = {
  provider: "Gemini",
  api_key: "",
  base_url: PROVIDERS.Gemini.base_url,
  model: PROVIDERS.Gemini.model
};

const DEFAULT_IMAGE_API = {
  provider: "Gemini",
  api_key: "",
  base_url: PROVIDERS.Gemini.base_url,
  model: ""
};

const DEFAULT_RISK_API = {
  provider: "Gemini",
  api_key: "",
  base_url: PROVIDERS.Gemini.base_url,
  model: PROVIDERS.Gemini.model
};

const app = document.getElementById("app");

const state = {
  items: [],
  pathSet: new Set(),
  selectedIds: new Set(),
  spacing: 0,
  spacingColor: DEFAULT_COLOR,
  spacingFillMode: DEFAULT_SPACING_FILL_MODE,
  spacingMicroShadowPercent: DEFAULT_MICRO_SHADOW_PERCENT,
  backgroundColor: DEFAULT_COLOR,
  exportWidth: 790,
  customExportWidth: false,
  exportMode: "long",
  previewZoom: 1,
  config: {
    last_save_dir: "",
    spacing_fill_mode: DEFAULT_SPACING_FILL_MODE,
    spacing_micro_shadow_percent: DEFAULT_MICRO_SHADOW_PERCENT,
    prompt_api: { ...DEFAULT_PROMPT_API },
    risk_api: { ...DEFAULT_RISK_API },
    image_api: { ...DEFAULT_IMAGE_API },
    update: { manifest_url: DEFAULT_UPDATE_MANIFEST_URL }
  },
  batchQueue: [],
  promptControllers: new Map(),
  templateMode: false,
  templateRunning: false,
  ledgerMode: false,
  costLedger: [],
  fileDragReferenceItemId: "",
  layerNudgeSideTimer: 0,
  productImages: [],
  productPathSet: new Set(),
  productLargeUrl: "",
  promptTemplateSettings: {
    mode: "extract",
    extractText: DEFAULT_EXTRACT_PROMPT,
    templateText: "",
    savedTemplateText: "",
    presets: []
  },
  presetMenuId: "",
  confirmAction: null,
  riskLexicon: structuredClone(DEFAULT_RISK_LEXICON),
  riskSearch: "",
  selectedRiskCategory: "极限词",
  riskBatchRunning: false,
  listActionMode: "",
  batchReplaceMode: false,
  layerMode: false,
  layerBounds: { width: 0, height: 0 },
  layerInteraction: null,
  activeTool: "move",
  shapeDraft: null,
  selectionDraft: null,
  draftScrollLock: null,
  snapGuides: [],
  spacePanActive: false,
  spacePanDrag: null,
  layerHistory: [],
  layerReplacementPreview: new Map(),
  suppressNextLayerClick: false,
  suppressNextPreviewClear: false,
  textLayerCounter: 0,
  rectangleCounter: 0,
  replacementImportTargetId: "",
  previewRenderTimer: 0,
  previewImageCache: new Map(),
  toastTimer: null,
  sortState: {
    active: false,
    sourceId: "",
    targetId: "",
    placement: "after",
    pointerX: 0,
    pointerY: 0,
    autoScrollFrame: 0
  },
  replacementSort: {
    active: false,
    sourceId: "",
    targetId: "",
    placement: "before"
  },
  updateInfo: null,
  updateChecking: false,
  updateDownloading: false,
  updatePromptedVersion: "",
  updateCheckTimer: 0
};

app.innerHTML = `
  <div class="app-shell">
    <div class="topbar">
      <button id="apiSettingsBtn" class="button">设置</button>
      <button id="promptTemplateBtn" class="button">提示词模版</button>
      <button id="templateWorkflowBtn" class="button">一键套版</button>
      <button id="costLedgerBtn" class="button">台账</button>
      <button id="exitTemplateBtn" class="weak" hidden>退出套版</button>
      <button id="generateAllBtn" class="button">生成提示词</button>
      <button id="copyAllBtn" class="button">复制全部</button>
      <button id="inspectAllBtn" class="button">排查极限词</button>
      <button id="riskLexiconBtn" class="icon-button top-icon-button" title="极限词库" aria-label="极限词库">
        <span class="list-icon" aria-hidden="true"></span>
      </button>
      <button id="batchReplaceBtn" class="button">批量替换</button>
      <button id="layerTemplateBtn" class="button">分层套版</button>
      <div class="zoom-controls topbar-zoom-controls">
        <button id="zoomOutBtn" class="zoom-button">-</button>
        <span id="zoomLabel" class="zoom-label">100%</span>
        <button id="zoomInBtn" class="zoom-button">+</button>
      </div>
      <button id="updateNoticeBtn" class="update-notice" hidden>发现更新</button>
      <div id="apiStatus" class="status-pill"></div>
    </div>

    <div class="workspace">
      <section id="dropPage" class="drop-page">
        <div id="dropArea" class="drop-area">
          <div class="drop-title">拖拽图片到这里</div>
          <div class="drop-subtitle">支持 JPG、JPEG、PNG、WEBP、BMP、TIFF</div>
          <div class="drop-hint">也可以点击此区域选择图片文件</div>
          <div class="drop-actions">
            <button id="chooseFilesBtn" class="primary">选择图片</button>
            <button id="chooseFolderBtn" class="button">选择文件夹</button>
          </div>
        </div>
      </section>

      <section id="previewPage" class="preview-page" hidden>
        <div class="preview-shell">
          <div id="toolRail" class="tool-rail">
            <button id="moveToolBtn" class="tool-button active" type="button" title="移动工具" aria-label="移动工具"><span class="tool-icon tool-icon-move" aria-hidden="true"></span></button>
            <button id="textToolBtn" class="tool-button" type="button" title="字体工具" aria-label="字体工具"><span class="tool-icon tool-icon-text">T</span></button>
            <button id="rectToolBtn" class="tool-button" type="button" title="矩形工具" aria-label="矩形工具"><span class="tool-icon tool-icon-rect"></span></button>
          </div>
          <div id="previewWrap" class="preview-wrap">
            <div id="previewCanvas" class="preview-canvas"></div>
          </div>

          <aside class="side-panel">
            <div class="list-head">图片列表</div>
            <div id="layerAlignBar" class="layer-align-bar" hidden></div>
            <div id="imageList" class="image-list"></div>
            <div id="riskPanel" class="risk-panel">
              <div class="risk-panel-head">
                <span>排查结果</span>
                <span id="riskSummaryBadge" class="risk-summary-badge">0</span>
              </div>
              <div id="riskSummary" class="risk-summary">排查结果仅供参考，请以平台规则和人工审核为准。</div>
            </div>
          </aside>
        </div>
      </section>

      <section id="ledgerPage" class="ledger-page" hidden>
        <div class="ledger-shell">
          <div class="ledger-title">费用台账</div>
          <div id="ledgerList" class="ledger-list"></div>
        </div>
      </section>
    </div>

    <div class="bottombar">
      <button id="ledgerBackBtn" class="primary" hidden>返回</button>
      <button id="exportTemplateBtn" class="primary export-template-button" hidden>导出套版</button>
      <button id="addImagesBtn" class="button">添加图片</button>
      <button id="addFolderBtn" class="button">添加文件夹</button>
      <input id="spacingInput" class="input spacing" type="number" min="0" step="1" placeholder="设置间距" />
      <button id="spacingApplyBtn" class="icon-button" title="应用间距">✓</button>
      <select id="spacingFillModeSelect" class="input spacing-fill-select" title="渐变融合会自动读取上下图片边缘颜色，让拼接间距更自然。">
        <option value="solid">纯色填充</option>
        <option value="extend">边缘延展</option>
        <option value="gradient">渐变融合</option>
        <option value="blur">模糊融合</option>
        <option value="mirror">镜像延展</option>
        <option value="microShadow">微阴影分区</option>
      </select>
      <input id="spacingMicroShadowInput" class="input spacing" type="number" min="1" max="20" step="1" value="8" placeholder="色差百分比" title="色差百分比" />
      <span id="spacingFillHint" class="spacing-fill-hint">渐变融合会自动读取上下图片边缘颜色</span>
      <span id="bottomSpacer" class="spacer"></span>
      <button id="eyedropperBtn" class="eyedropper solid-fill-control" title="吸管取色" aria-label="吸管取色">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M14.7 4.3a2.4 2.4 0 0 1 3.4 0l1.6 1.6a2.4 2.4 0 0 1 0 3.4l-2 2 1.4 1.4-1.4 1.4-7.8-7.8 1.4-1.4 1.4 1.4 2-2Z"></path>
          <path d="m8.9 7.3 7.8 7.8-6.2 6.2H6.4l-2.1-2.1v-4.1l6.2-6.2-1.6-1.6Z"></path>
          <path d="M6.4 15.9v2.5l.7.7h2.5"></path>
        </svg>
      </button>
      <div class="color-group solid-fill-control">
        <span id="colorSwatch" class="color-swatch"></span>
        <input id="colorInput" class="color-input" type="text" value="#FFFFFF" />
      </div>
      <button id="colorApplyBtn" class="icon-button solid-fill-control" title="应用颜色">✓</button>
      <div id="bottomStatus" class="status-text"></div>
      <select id="exportWidthSelect" class="input select">
        <option value="750">750px</option>
        <option value="790">790px</option>
        <option value="800">800px</option>
        <option value="1920">1920px</option>
        <option value="custom">自定义</option>
      </select>
      <input id="customExportWidthInput" class="input custom-width-input" type="number" min="1" step="1" placeholder="宽度" hidden />
      <select id="exportModeSelect" class="input select">
        <option value="long">长图</option>
        <option value="slices">切片</option>
      </select>
      <button id="carouselSeparatorBtn" class="button">轮播分隔</button>
      <button id="commonShopHeaderBtn" class="button">1688通用店招</button>
      <button id="saveBtn" class="primary">导出</button>
      <button id="replacementExportBtn" class="primary replacement-export-button" hidden>替换导出</button>
      <button id="clearBtn" class="weak">清除</button>
    </div>

    <input id="fileInput" class="hidden-file-input" type="file" accept=".jpg,.jpeg,.png,.webp,.bmp,.tif,.tiff" multiple />
    <input id="replacementFileInput" class="hidden-file-input" type="file" accept=".jpg,.jpeg,.png,.webp,.bmp,.tif,.tiff" multiple />

    <div id="settingsModal" class="modal-layer">
      <div class="modal-card api-settings-card">
        <div class="api-settings-topbar">
          <div class="modal-title">API 设置</div>
          <button id="saveAllApiBtn" class="primary">保存</button>
        </div>
        <div class="api-settings-sections">
          <section class="api-section">
            <div class="api-section-head">
              <div class="api-section-title">提示词 API</div>
              <div class="api-section-desc">识别图片文生图信息，并按提示词模版要求使用文字描述图片内容。</div>
            </div>
            <div class="form-grid">
              <div class="label">API 服务商</div>
              <select id="promptProviderSelect" class="input"></select>
              <div class="label api-key-field">API Key</div>
              <input id="promptApiKeyInput" class="input api-key-field" type="password" autocomplete="off" />
              <div class="label">Base URL</div>
              <input id="promptBaseUrlInput" class="input" type="text" />
              <div class="label">模型名称</div>
              <input id="promptModelInput" class="input" type="text" />
            </div>
            <div id="promptProviderHint" class="hint-box"></div>
            <div class="inline-row">
              <button id="testPromptApiBtn" class="button">测试提示词 API</button>
            </div>
          </section>
          <section class="api-section">
            <div class="api-section-head">
              <div class="api-section-title">极限词 API</div>
              <div class="api-section-desc">仅用于 OCR 识别图片中的文字，识别后再用极限词库匹配风险词。</div>
            </div>
            <div class="form-grid">
              <div class="label">API 服务商</div>
              <select id="riskProviderSelect" class="input"></select>
              <div class="label api-key-field">API Key</div>
              <input id="riskApiKeyInput" class="input api-key-field" type="password" autocomplete="off" />
              <div class="label">Base URL</div>
              <input id="riskBaseUrlInput" class="input" type="text" />
              <div class="label">模型名称</div>
              <input id="riskModelInput" class="input" type="text" />
            </div>
            <div id="riskProviderHint" class="hint-box"></div>
            <div class="inline-row">
              <button id="testRiskApiBtn" class="button">测试极限词 API</button>
            </div>
          </section>
          <section class="api-section">
            <div class="api-section-head">
              <div class="api-section-title">生图 API</div>
              <div class="api-section-desc">用于一键套版、重新生成、产品图套版等图片生成任务。</div>
            </div>
            <div class="form-grid">
              <div class="label">API 服务商</div>
              <select id="imageProviderSelect" class="input"></select>
              <div class="label api-key-field">API Key</div>
              <input id="imageApiKeyInput" class="input api-key-field" type="password" autocomplete="off" />
              <div class="label">Base URL</div>
              <input id="imageBaseUrlInput" class="input" type="text" />
              <div class="label">模型名称</div>
              <input id="imageModelInput" class="input" type="text" />
            </div>
            <div id="imageProviderHint" class="hint-box"></div>
            <div class="inline-row">
              <button id="testImageApiBtn" class="button">测试生图 API</button>
            </div>
          </section>
          <section class="api-section">
            <div class="api-section-head">
              <div class="api-section-title">局域网更新</div>
              <div class="api-section-desc">填写局域网内 update.json 地址，软件启动时会自动检查新版。</div>
            </div>
            <div class="form-grid">
              <div class="label">更新地址</div>
              <input id="updateManifestUrlInput" class="input" type="text" placeholder="http://192.168.1.10:8000/update.json" />
            </div>
            <div class="hint-box">清单示例：{"version":"0.1.1","url":"http://192.168.1.10:8000/新版.exe","file_name":"新版.exe","notes":"更新说明"}</div>
            <div class="inline-row">
              <button id="checkUpdateBtn" class="button">检查更新</button>
            </div>
          </section>
        </div>
      </div>
    </div>

    <div id="promptTemplateModal" class="modal-layer">
      <div class="modal-card prompt-template-card">
        <div class="modal-title">提示词模版设置</div>
        <div class="template-edit-section">
          <label class="template-radio-title">
            <input id="extractModeRadio" type="radio" name="promptTemplateMode" value="extract" />
            <span>提取提示词</span>
          </label>
          <textarea id="extractPromptInput" class="template-textarea"></textarea>
        </div>
        <div class="template-edit-section">
          <label class="template-radio-title">
            <input id="templateModeRadio" type="radio" name="promptTemplateMode" value="template" />
            <span>提示词模板</span>
          </label>
          <textarea id="templatePromptInput" class="template-textarea" placeholder="可输入一键套版或重新生成时追加的生图规则"></textarea>
          <div id="templateActionRow" class="template-action-row">
            <button id="savePresetBtn" class="button">保存模板</button>
            <button id="savePromptTemplateBtn" class="primary">复制</button>
            <button id="clearPromptTemplateBtn" class="weak">清除</button>
          </div>
          <div id="presetTagList" class="preset-tag-list"></div>
        </div>
        <div class="inline-row">
          <select id="promptTemplateImportModeSelect" class="input compact-select" title="导入方式">
            <option value="append">追加导入</option>
            <option value="replace">覆盖导入</option>
          </select>
          <button id="importPromptTemplateBtn" class="button">导入模板</button>
          <select id="promptTemplateExportFormatSelect" class="input compact-select" title="导出格式">
            <option value="json">JSON</option>
            <option value="txt">TXT</option>
            <option value="csv">CSV</option>
          </select>
          <button id="exportPromptTemplateBtn" class="button">导出模板</button>
          <input id="promptTemplateImportInput" class="hidden-file-input" type="file" accept=".json,.txt,.csv" />
          <div style="flex:1"></div>
          <button id="closePromptTemplateBtn" class="weak">保存并关闭</button>
        </div>
      </div>
    </div>

    <div id="presetContextMenu" class="preset-context-menu">
      <button id="renamePresetBtn" type="button">重命名标签</button>
      <button id="deletePresetBtn" type="button">删除标签</button>
    </div>

    <div id="riskModal" class="modal-layer">
      <div class="modal-card risk-modal-card">
        <div class="modal-title">极限词库</div>
        <div class="risk-toolbar">
          <input id="riskSearchInput" class="input" type="text" placeholder="搜索词语或分类" />
          <select id="riskCategorySelect" class="input select"></select>
          <input id="riskWordInput" class="input" type="text" placeholder="输入风险词" />
          <button id="addRiskWordBtn" class="primary">新增</button>
        </div>
        <div id="riskWordList" class="risk-word-list"></div>
        <div class="risk-note">排查结果仅供参考，请以平台规则和人工审核为准。</div>
        <div class="inline-row">
          <select id="riskImportModeSelect" class="input compact-select" title="导入方式">
            <option value="append">追加导入</option>
            <option value="replace">覆盖导入</option>
          </select>
          <button id="importRiskBtn" class="button">导入词库</button>
          <select id="riskExportFormatSelect" class="input compact-select" title="导出格式">
            <option value="json">JSON</option>
            <option value="txt">TXT</option>
            <option value="csv">CSV</option>
          </select>
          <button id="exportRiskBtn" class="button">导出词库</button>
          <input id="riskImportInput" class="hidden-file-input" type="file" accept=".json,.txt,.csv" />
          <div style="flex:1"></div>
          <button id="resetRiskBtn" class="weak reset-risk-button">恢复默认</button>
          <button id="closeRiskBtn" class="primary">完成</button>
        </div>
      </div>
    </div>

    <div id="productModal" class="modal-layer">
      <div class="modal-card product-modal-card">
        <div class="modal-title">添加产品图片</div>
        <div id="productDropArea" class="product-drop-area">
          <div class="product-hint">请放入需套版的产品图，建议使用产品抠图或白底图，可以拖放、粘贴或点击上传产品图</div>
          <button id="chooseProductBtn" class="button">上传产品图</button>
        </div>
        <div id="productGrid" class="product-grid"></div>
        <div class="inline-row">
          <button id="saveProductBtn" class="button">保存并关闭</button>
          <div id="templatePromptStatus" class="status-text"></div>
          <div style="flex:1"></div>
          <button id="startTemplateBtn" class="primary" disabled>请等待提示词提取完成</button>
        </div>
      </div>
    </div>

    <div id="productPreviewLayer" class="product-preview-layer">
      <img id="productPreviewImage" alt="产品图预览" />
    </div>

    <div id="confirmModal" class="modal-layer">
      <div class="modal-card confirm-card">
        <div id="confirmTitle" class="modal-title">确认操作</div>
        <div id="confirmText" class="confirm-text"></div>
        <div class="inline-row">
          <div style="flex:1"></div>
          <button id="cancelConfirmBtn" class="weak">取消</button>
          <button id="confirmActionBtn" class="danger-button">确认</button>
        </div>
      </div>
    </div>

    <div id="toast" class="toast"></div>
  </div>
`;

const refs = {
  dropPage: document.getElementById("dropPage"),
  previewPage: document.getElementById("previewPage"),
  ledgerPage: document.getElementById("ledgerPage"),
  ledgerList: document.getElementById("ledgerList"),
  dropArea: document.getElementById("dropArea"),
  chooseFilesBtn: document.getElementById("chooseFilesBtn"),
  chooseFolderBtn: document.getElementById("chooseFolderBtn"),
  addImagesBtn: document.getElementById("addImagesBtn"),
  addFolderBtn: document.getElementById("addFolderBtn"),
  fileInput: document.getElementById("fileInput"),
  replacementFileInput: document.getElementById("replacementFileInput"),
  previewWrap: document.getElementById("previewWrap"),
  previewCanvas: document.getElementById("previewCanvas"),
  layerAlignBar: document.getElementById("layerAlignBar"),
  toolRail: document.getElementById("toolRail"),
  moveToolBtn: document.getElementById("moveToolBtn"),
  textToolBtn: document.getElementById("textToolBtn"),
  rectToolBtn: document.getElementById("rectToolBtn"),
  imageList: document.getElementById("imageList"),
  zoomLabel: document.getElementById("zoomLabel"),
  spacingInput: document.getElementById("spacingInput"),
  spacingFillModeSelect: document.getElementById("spacingFillModeSelect"),
  spacingMicroShadowInput: document.getElementById("spacingMicroShadowInput"),
  spacingFillHint: document.getElementById("spacingFillHint"),
  bottomSpacer: document.getElementById("bottomSpacer"),
  colorInput: document.getElementById("colorInput"),
  colorSwatch: document.getElementById("colorSwatch"),
  exportWidthSelect: document.getElementById("exportWidthSelect"),
  customExportWidthInput: document.getElementById("customExportWidthInput"),
  exportModeSelect: document.getElementById("exportModeSelect"),
  carouselSeparatorBtn: document.getElementById("carouselSeparatorBtn"),
  commonShopHeaderBtn: document.getElementById("commonShopHeaderBtn"),
  bottomStatus: document.getElementById("bottomStatus"),
  toast: document.getElementById("toast"),
  apiStatus: document.getElementById("apiStatus"),
  updateNoticeBtn: document.getElementById("updateNoticeBtn"),
  costLedgerBtn: document.getElementById("costLedgerBtn"),
  ledgerBackBtn: document.getElementById("ledgerBackBtn"),
  promptTemplateBtn: document.getElementById("promptTemplateBtn"),
  templateWorkflowBtn: document.getElementById("templateWorkflowBtn"),
  exitTemplateBtn: document.getElementById("exitTemplateBtn"),
  exportTemplateBtn: document.getElementById("exportTemplateBtn"),
  riskLexiconBtn: document.getElementById("riskLexiconBtn"),
  inspectAllBtn: document.getElementById("inspectAllBtn"),
  batchReplaceBtn: document.getElementById("batchReplaceBtn"),
  layerTemplateBtn: document.getElementById("layerTemplateBtn"),
  riskPanel: document.getElementById("riskPanel"),
  riskSummary: document.getElementById("riskSummary"),
  riskSummaryBadge: document.getElementById("riskSummaryBadge"),
  generateAllBtn: document.getElementById("generateAllBtn"),
  copyAllBtn: document.getElementById("copyAllBtn"),
  saveBtn: document.getElementById("saveBtn"),
  replacementExportBtn: document.getElementById("replacementExportBtn"),
  clearBtn: document.getElementById("clearBtn"),
  spacingApplyBtn: document.getElementById("spacingApplyBtn"),
  colorApplyBtn: document.getElementById("colorApplyBtn"),
  eyedropperBtn: document.getElementById("eyedropperBtn"),
  zoomOutBtn: document.getElementById("zoomOutBtn"),
  zoomInBtn: document.getElementById("zoomInBtn"),
  apiSettingsBtn: document.getElementById("apiSettingsBtn"),
  settingsModal: document.getElementById("settingsModal"),
  saveAllApiBtn: document.getElementById("saveAllApiBtn"),
  promptProviderSelect: document.getElementById("promptProviderSelect"),
  promptApiKeyInput: document.getElementById("promptApiKeyInput"),
  promptBaseUrlInput: document.getElementById("promptBaseUrlInput"),
  promptModelInput: document.getElementById("promptModelInput"),
  promptProviderHint: document.getElementById("promptProviderHint"),
  testPromptApiBtn: document.getElementById("testPromptApiBtn"),
  riskProviderSelect: document.getElementById("riskProviderSelect"),
  riskApiKeyInput: document.getElementById("riskApiKeyInput"),
  riskBaseUrlInput: document.getElementById("riskBaseUrlInput"),
  riskModelInput: document.getElementById("riskModelInput"),
  riskProviderHint: document.getElementById("riskProviderHint"),
  testRiskApiBtn: document.getElementById("testRiskApiBtn"),
  imageProviderSelect: document.getElementById("imageProviderSelect"),
  imageApiKeyInput: document.getElementById("imageApiKeyInput"),
  imageBaseUrlInput: document.getElementById("imageBaseUrlInput"),
  imageModelInput: document.getElementById("imageModelInput"),
  imageProviderHint: document.getElementById("imageProviderHint"),
  testImageApiBtn: document.getElementById("testImageApiBtn"),
  updateManifestUrlInput: document.getElementById("updateManifestUrlInput"),
  checkUpdateBtn: document.getElementById("checkUpdateBtn"),
  promptTemplateModal: document.getElementById("promptTemplateModal"),
  extractModeRadio: document.getElementById("extractModeRadio"),
  templateModeRadio: document.getElementById("templateModeRadio"),
  extractPromptInput: document.getElementById("extractPromptInput"),
  templatePromptInput: document.getElementById("templatePromptInput"),
  templateActionRow: document.getElementById("templateActionRow"),
  savePresetBtn: document.getElementById("savePresetBtn"),
  savePromptTemplateBtn: document.getElementById("savePromptTemplateBtn"),
  clearPromptTemplateBtn: document.getElementById("clearPromptTemplateBtn"),
  importPromptTemplateBtn: document.getElementById("importPromptTemplateBtn"),
  exportPromptTemplateBtn: document.getElementById("exportPromptTemplateBtn"),
  promptTemplateImportInput: document.getElementById("promptTemplateImportInput"),
  promptTemplateImportModeSelect: document.getElementById("promptTemplateImportModeSelect"),
  promptTemplateExportFormatSelect: document.getElementById("promptTemplateExportFormatSelect"),
  presetTagList: document.getElementById("presetTagList"),
  closePromptTemplateBtn: document.getElementById("closePromptTemplateBtn"),
  presetContextMenu: document.getElementById("presetContextMenu"),
  renamePresetBtn: document.getElementById("renamePresetBtn"),
  deletePresetBtn: document.getElementById("deletePresetBtn"),
  riskModal: document.getElementById("riskModal"),
  riskSearchInput: document.getElementById("riskSearchInput"),
  riskCategorySelect: document.getElementById("riskCategorySelect"),
  riskWordInput: document.getElementById("riskWordInput"),
  addRiskWordBtn: document.getElementById("addRiskWordBtn"),
  riskWordList: document.getElementById("riskWordList"),
  importRiskBtn: document.getElementById("importRiskBtn"),
  exportRiskBtn: document.getElementById("exportRiskBtn"),
  riskImportInput: document.getElementById("riskImportInput"),
  riskImportModeSelect: document.getElementById("riskImportModeSelect"),
  riskExportFormatSelect: document.getElementById("riskExportFormatSelect"),
  resetRiskBtn: document.getElementById("resetRiskBtn"),
  closeRiskBtn: document.getElementById("closeRiskBtn"),
  productModal: document.getElementById("productModal"),
  productDropArea: document.getElementById("productDropArea"),
  chooseProductBtn: document.getElementById("chooseProductBtn"),
  productGrid: document.getElementById("productGrid"),
  saveProductBtn: document.getElementById("saveProductBtn"),
  startTemplateBtn: document.getElementById("startTemplateBtn"),
  templatePromptStatus: document.getElementById("templatePromptStatus"),
  productPreviewLayer: document.getElementById("productPreviewLayer"),
  productPreviewImage: document.getElementById("productPreviewImage"),
  confirmModal: document.getElementById("confirmModal"),
  confirmTitle: document.getElementById("confirmTitle"),
  confirmText: document.getElementById("confirmText"),
  cancelConfirmBtn: document.getElementById("cancelConfirmBtn"),
  confirmActionBtn: document.getElementById("confirmActionBtn")
};

function isTauri() {
  return Boolean(window.__TAURI_INTERNALS__);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function gcd(a, b) {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y) {
    [x, y] = [y, x % y];
  }
  return x || 1;
}

function ratioText(width, height) {
  const div = gcd(width, height);
  return `${width / div}:${height / div}`;
}

function orientationText(width, height) {
  if (width > height) return "横图";
  if (width < height) return "竖图";
  return "方图";
}

function naturalParts(text) {
  return text.split(/(\d+)/).map(part => (/^\d+$/.test(part) ? Number(part) : part.toLowerCase()));
}

function naturalCompare(a, b) {
  const left = naturalParts(a);
  const right = naturalParts(b);
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const l = left[index];
    const r = right[index];
    if (l === undefined) return -1;
    if (r === undefined) return 1;
    if (typeof l === "number" && typeof r === "number") {
      if (l !== r) return l - r;
      continue;
    }
    const result = String(l).localeCompare(String(r), "zh-CN");
    if (result !== 0) return result;
  }
  return 0;
}

function normalizeHexColor(value) {
  const trimmed = String(value || "").trim();
  if (!/^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(trimmed)) return null;
  if (trimmed.length === 4) {
    return `#${trimmed[1]}${trimmed[1]}${trimmed[2]}${trimmed[2]}${trimmed[3]}${trimmed[3]}`.toUpperCase();
  }
  return trimmed.toUpperCase();
}

function blendRgbChannels(source, target, amount) {
  const ratio = Math.max(0, Math.min(1, amount));
  const inverse = 1 - ratio;
  return [
    Math.round(source[0] * inverse + target[0] * ratio),
    Math.round(source[1] * inverse + target[1] * ratio),
    Math.round(source[2] * inverse + target[2] * ratio)
  ];
}

function lightenRgb(rgb, amount = 0.1) {
  return blendRgbChannels(rgb, [255, 255, 255], amount);
}

function darkenRgb(rgb, amount = 0.1) {
  return blendRgbChannels(rgb, [0, 0, 0], amount);
}

function smoothStep(value) {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
}

function rgbCss(rgb) {
  return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
}

function normalizeMicroShadowPercent(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return DEFAULT_MICRO_SHADOW_PERCENT;
  return Math.max(1, Math.min(20, Math.round(numeric)));
}

function microShadowAmountFromPercent(value) {
  return normalizeMicroShadowPercent(value) / 100;
}

function normalizeRiskLexicon(value) {
  const source = value && typeof value === "object" ? value : DEFAULT_RISK_LEXICON;
  const normalized = {};
  for (const [category, words] of Object.entries(source)) {
    const name = String(category || "").trim();
    if (!name) continue;
    const unique = new Set();
    for (const word of Array.isArray(words) ? words : []) {
      const text = String(word || "").trim();
      if (text) unique.add(text);
    }
    normalized[name] = Array.from(unique).sort((a, b) => a.localeCompare(b, "zh-CN"));
  }
  return Object.keys(normalized).length ? normalized : structuredClone(DEFAULT_RISK_LEXICON);
}

function mergeRiskLexicons(base, incoming) {
  const result = normalizeRiskLexicon(base);
  const next = normalizeRiskLexicon(incoming);
  for (const [category, words] of Object.entries(next)) {
    if (!result[category]) result[category] = [];
    result[category].push(...words);
  }
  return normalizeRiskLexicon(result);
}

function riskLexiconWordCount(lexicon) {
  return Object.values(lexicon || {}).reduce((sum, words) => sum + (Array.isArray(words) ? words.length : 0), 0);
}

function parseCsvLine(line) {
  const cells = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      cells.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells.map(value => value.trim());
}

function parseTxtRiskLexicon(text) {
  const result = {};
  let currentCategory = "极限词";
  for (const rawLine of String(text || "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const categoryMatch = line.match(/^\[(.+)]$/);
    if (categoryMatch) {
      currentCategory = categoryMatch[1].trim() || "极限词";
      continue;
    }
    const parts = line.includes(",") ? line.split(",") : line.includes("\t") ? line.split("\t") : null;
    if (parts && parts.length >= 2) {
      const category = parts[0].trim() || currentCategory;
      const word = parts.slice(1).join(",").trim();
      if (word) (result[category] ||= []).push(word);
    } else {
      (result[currentCategory] ||= []).push(line);
    }
  }
  return normalizeRiskLexicon(result);
}

function parseCsvRiskLexicon(text) {
  const result = {};
  const lines = String(text || "").replace(/^\uFEFF/, "").split(/\r?\n/).filter(line => line.trim());
  for (const [index, line] of lines.entries()) {
    const cells = parseCsvLine(line);
    if (index === 0 && /分类|category/i.test(cells[0] || "") && /词|word/i.test(cells[1] || "")) continue;
    const category = (cells[0] || "极限词").trim();
    const word = (cells[1] || "").trim();
    if (word) (result[category] ||= []).push(word);
  }
  return normalizeRiskLexicon(result);
}

function parseRiskLexiconFile(text, fileName = "") {
  const extension = (fileName.split(".").pop() || "").toLowerCase();
  if (extension === "csv") return parseCsvRiskLexicon(text);
  if (extension === "txt") return parseTxtRiskLexicon(text);
  try {
    return normalizeRiskLexicon(JSON.parse(text));
  } catch {
    if (text.includes(",") || text.includes("\t")) return parseCsvRiskLexicon(text);
    return parseTxtRiskLexicon(text);
  }
}

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function serializeRiskLexicon(format) {
  const lexicon = normalizeRiskLexicon(state.riskLexicon);
  if (format === "txt") {
    return Object.entries(lexicon)
      .map(([category, words]) => `[${category}]\n${words.join("\n")}`)
      .join("\n\n");
  }
  if (format === "csv") {
    const rows = ["分类,词语"];
    for (const [category, words] of Object.entries(lexicon)) {
      for (const word of words) rows.push(`${csvEscape(category)},${csvEscape(word)}`);
    }
    return `\uFEFF${rows.join("\n")}`;
  }
  return JSON.stringify(lexicon, null, 2);
}

function loadRiskLexicon() {
  try {
    const presetVersion = localStorage.getItem(RISK_LEXICON_PRESET_VERSION_KEY);
    if (presetVersion !== RISK_LEXICON_PRESET_VERSION) {
      state.riskLexicon = normalizeRiskLexicon(DEFAULT_RISK_LEXICON);
      saveRiskLexicon();
      localStorage.setItem(RISK_LEXICON_PRESET_VERSION_KEY, RISK_LEXICON_PRESET_VERSION);
      state.selectedRiskCategory = Object.keys(state.riskLexicon)[0] || "极限词";
      return;
    }
    const text = localStorage.getItem(RISK_LEXICON_STORAGE_KEY);
    if (text) {
      state.riskLexicon = normalizeRiskLexicon(JSON.parse(text));
    }
  } catch {
    state.riskLexicon = structuredClone(DEFAULT_RISK_LEXICON);
  }
  if (!state.riskLexicon[state.selectedRiskCategory]) {
    state.selectedRiskCategory = Object.keys(state.riskLexicon)[0] || "极限词";
  }
}

function saveRiskLexicon() {
  localStorage.setItem(RISK_LEXICON_STORAGE_KEY, JSON.stringify(state.riskLexicon, null, 2));
  localStorage.setItem(RISK_LEXICON_PRESET_VERSION_KEY, RISK_LEXICON_PRESET_VERSION);
}

function normalizeApiConfig(value, fallback) {
  const source = value && typeof value === "object" ? value : {};
  return {
    provider: String(source.provider || fallback.provider || "Gemini"),
    api_key: String(source.api_key || ""),
    base_url: String(source.base_url || fallback.base_url || ""),
    model: String(source.model || fallback.model || "")
  };
}

function normalizeUpdateConfig(value) {
  const source = value && typeof value === "object" ? value : {};
  const manifestUrl = String(source.manifest_url || source.manifestUrl || "").trim();
  return {
    manifest_url: manifestUrl || DEFAULT_UPDATE_MANIFEST_URL
  };
}

function normalizeAppConfig(value) {
  const source = value && typeof value === "object" ? value : {};
  const legacyApi = normalizeApiConfig(source.api, DEFAULT_PROMPT_API);
  const hasPromptApi = Boolean(source.prompt_api && typeof source.prompt_api === "object");
  const promptApi = hasPromptApi
    ? normalizeApiConfig(source.prompt_api, DEFAULT_PROMPT_API)
    : (legacyApi.api_key || source.api ? legacyApi : normalizeApiConfig(null, DEFAULT_PROMPT_API));
  const hasRiskApi = Boolean(source.risk_api && typeof source.risk_api === "object");
  const riskApi = hasRiskApi
    ? normalizeApiConfig(source.risk_api, DEFAULT_RISK_API)
    : normalizeApiConfig(promptApi, DEFAULT_RISK_API);
  return {
    last_save_dir: String(source.last_save_dir || ""),
    spacing_fill_mode: ["solid", "extend", "gradient", "blur", "mirror", "microShadow"].includes(source.spacing_fill_mode)
      ? source.spacing_fill_mode
      : "solid",
    spacing_micro_shadow_percent: normalizeMicroShadowPercent(source.spacing_micro_shadow_percent ?? source.spacingMicroShadowPercent),
    prompt_api: promptApi,
    risk_api: riskApi,
    image_api: normalizeApiConfig(source.image_api, DEFAULT_IMAGE_API),
    update: normalizeUpdateConfig(source.update)
  };
}

function normalizePromptTemplateSettings(value) {
  const source = value && typeof value === "object" ? value : {};
  const presets = Array.isArray(source.presets) ? source.presets : [];
  const extractText = !source.extractText || source.extractText === LEGACY_EXTRACT_PROMPT
    ? DEFAULT_EXTRACT_PROMPT
    : String(source.extractText);
  return {
    mode: source.mode === "template" ? "template" : "extract",
    extractText,
    templateText: String(source.templateText || ""),
    savedTemplateText: String(source.savedTemplateText || source.templateText || ""),
    presets: presets
      .filter(item => item && typeof item === "object" && String(item.content || "").trim())
      .map(item => ({
        id: String(item.id || crypto.randomUUID()),
        label: String(item.label || presetLabel(item.content)),
        content: String(item.content || "")
      }))
  };
}

function mergePromptTemplateSettings(base, incoming) {
  const current = normalizePromptTemplateSettings(base);
  const next = normalizePromptTemplateSettings(incoming);
  const mergedPresets = [...current.presets];
  const addContent = (content, label) => {
    const text = String(content || "").trim();
    if (!text) return;
    if (mergedPresets.some(item => item.content.trim() === text)) return;
    mergedPresets.push({
      id: crypto.randomUUID(),
      label: String(label || presetLabel(text)),
      content: text
    });
  };
  addContent(next.templateText, "导入模板");
  for (const preset of next.presets) addContent(preset.content, preset.label);
  return normalizePromptTemplateSettings({
    ...current,
    presets: mergedPresets
  });
}

function promptTemplateCount(settings = state.promptTemplateSettings) {
  const normalized = normalizePromptTemplateSettings(settings);
  const unique = new Set();
  if (normalized.templateText.trim()) unique.add(normalized.templateText.trim());
  for (const preset of normalized.presets) {
    if (preset.content.trim()) unique.add(preset.content.trim());
  }
  return unique.size;
}

function parseTxtPromptTemplateSettings(text) {
  const result = { presets: [] };
  let section = "";
  let label = "";
  let buffer = [];
  const flush = () => {
    const content = buffer.join("\n").trim();
    if (!content) {
      buffer = [];
      return;
    }
    if (section === "extract") result.extractText = content;
    else if (section === "template") result.templateText = content;
    else if (section === "preset") result.presets.push({ label: label || presetLabel(content), content });
    buffer = [];
  };
  for (const rawLine of String(text || "").replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const line = rawLine.trim();
    const match = line.match(/^\[(.+)]$/);
    if (match) {
      flush();
      const name = match[1].trim();
      if (/提取|extract/i.test(name)) section = "extract";
      else if (/当前|template|模板正文/i.test(name)) section = "template";
      else {
        section = "preset";
        label = name.replace(/^模板[:：]?/i, "").trim();
      }
    } else {
      buffer.push(rawLine);
    }
  }
  flush();
  return normalizePromptTemplateSettings(result);
}

function parseCsvPromptTemplateSettings(text) {
  const result = { presets: [] };
  const lines = String(text || "").replace(/^\uFEFF/, "").split(/\r?\n/).filter(line => line.trim());
  for (const [index, line] of lines.entries()) {
    const cells = parseCsvLine(line);
    if (index === 0 && /类型|type/i.test(cells[0] || "")) continue;
    const type = String(cells[0] || "").trim().toLowerCase();
    const label = String(cells[1] || "").trim();
    const content = String(cells.slice(2).join(",") || cells[1] || "").trim();
    if (!content) continue;
    if (type === "extract" || type === "提取提示词") result.extractText = content;
    else if (type === "current" || type === "template" || type === "当前模板") result.templateText = content;
    else result.presets.push({ label: label || presetLabel(content), content });
  }
  return normalizePromptTemplateSettings(result);
}

function parsePromptTemplateFile(text, fileName = "") {
  const extension = (fileName.split(".").pop() || "").toLowerCase();
  if (extension === "csv") return parseCsvPromptTemplateSettings(text);
  if (extension === "txt") return parseTxtPromptTemplateSettings(text);
  try {
    return normalizePromptTemplateSettings(JSON.parse(text));
  } catch {
    if (text.includes(",") || text.includes("\t")) return parseCsvPromptTemplateSettings(text);
    return parseTxtPromptTemplateSettings(text);
  }
}

function serializePromptTemplateSettings(format) {
  savePromptTemplateSettings(false);
  const settings = normalizePromptTemplateSettings(state.promptTemplateSettings);
  if (format === "txt") {
    const sections = [
      `[提取提示词]\n${settings.extractText || DEFAULT_EXTRACT_PROMPT}`,
      `[当前模板]\n${settings.templateText || ""}`
    ];
    for (const preset of settings.presets) {
      sections.push(`[模板:${preset.label || presetLabel(preset.content)}]\n${preset.content}`);
    }
    return sections.join("\n\n");
  }
  if (format === "csv") {
    const rows = ["类型,标签,内容"];
    rows.push(`extract,提取提示词,${csvEscape(settings.extractText || DEFAULT_EXTRACT_PROMPT)}`);
    rows.push(`current,当前模板,${csvEscape(settings.templateText || "")}`);
    for (const preset of settings.presets) {
      rows.push(`preset,${csvEscape(preset.label || presetLabel(preset.content))},${csvEscape(preset.content)}`);
    }
    return `\uFEFF${rows.join("\n")}`;
  }
  return JSON.stringify(settings, null, 2);
}

function loadPromptTemplateSettings() {
  try {
    const text = localStorage.getItem(PROMPT_TEMPLATE_STORAGE_KEY);
    state.promptTemplateSettings = normalizePromptTemplateSettings(text ? JSON.parse(text) : null);
  } catch {
    state.promptTemplateSettings = normalizePromptTemplateSettings(null);
  }
}

function savePromptTemplateSettings(showMessage = false) {
  state.promptTemplateSettings.extractText = refs.extractPromptInput?.value ?? state.promptTemplateSettings.extractText;
  state.promptTemplateSettings.templateText = refs.templatePromptInput?.value ?? state.promptTemplateSettings.templateText;
  state.promptTemplateSettings.mode = refs.templateModeRadio?.checked ? "template" : "extract";
  state.promptTemplateSettings.savedTemplateText = state.promptTemplateSettings.templateText;
  localStorage.setItem(PROMPT_TEMPLATE_STORAGE_KEY, JSON.stringify(state.promptTemplateSettings, null, 2));
  if (showMessage) showToast("已保存");
}

function presetLabel(content) {
  const text = String(content || "").trim();
  return text.length <= 4 ? text : text.slice(0, 4);
}

function currentExtractInstruction() {
  return (state.promptTemplateSettings.extractText || DEFAULT_EXTRACT_PROMPT).trim() || DEFAULT_EXTRACT_PROMPT;
}

function promptExtractionInstruction() {
  return `${currentExtractInstruction()}

Output a complete image prompt. Describe style, composition, product, text, colors, lighting, background, and transferable design rules. Do not return HTML, Markdown, JSON, coordinates, or repeated noise.`;
}

function currentTemplateInstruction() {
  return (state.promptTemplateSettings.templateText || "").trim();
}

function hasPresetContent(content) {
  return state.promptTemplateSettings.presets.some(item => item.content === content);
}

function saveTemplateAsPreset(content, showMessage = true) {
  const text = String(content || "").trim();
  if (!text) return null;
  if (hasPresetContent(text)) return null;
  const preset = {
    id: crypto.randomUUID(),
    label: presetLabel(text),
    content: text
  };
  state.promptTemplateSettings.presets.push(preset);
  localStorage.setItem(PROMPT_TEMPLATE_STORAGE_KEY, JSON.stringify(state.promptTemplateSettings, null, 2));
  if (showMessage) showToast("已保存模板");
  return preset;
}

function allRiskWords() {
  const words = [];
  for (const [category, list] of Object.entries(state.riskLexicon)) {
    for (const word of list) {
      words.push({ category, word });
    }
  }
  return words.sort((a, b) => b.word.length - a.word.length || a.word.localeCompare(b.word, "zh-CN"));
}

function matchRiskWords(text) {
  const source = normalizeRiskText(text);
  const seen = new Set();
  const matches = [];
  for (const entry of allRiskWords()) {
    const normalizedWord = normalizeRiskText(entry.word);
    const key = `${entry.category}\u0000${entry.word}`;
    if (normalizedWord && !seen.has(key) && source.includes(normalizedWord)) {
      seen.add(key);
      matches.push(entry);
    }
  }
  return matches;
}

function normalizeRiskText(value) {
  return String(value || "").replace(/[\s\u00A0\u3000]+/g, "");
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function highlightRiskText(text, matches) {
  let html = escapeHtml(text || "未识别到文字");
  const words = Array.from(new Set(matches.map(item => item.word))).sort((a, b) => b.length - a.length);
  for (const word of words) {
    const escaped = escapeHtml(word);
    html = html.replaceAll(escaped, `<mark class="risk-mark">${escaped}</mark>`);
  }
  return html;
}

function normalizeSidePadding(value) {
  const source = value && typeof value === "object" ? value : {};
  const numericValue = Number(source.value);
  const verticalValue = Number(source.verticalValue ?? source.vertical_value ?? source.y ?? 0);
  const topSource = source.topValue ?? source.top_value ?? source.top ?? verticalValue;
  const bottomSource = source.bottomValue ?? source.bottom_value ?? source.bottom ?? verticalValue;
  const topValue = Number(topSource);
  const bottomValue = Number(bottomSource);
  const mode = SIDE_PADDING_MODES.includes(source.mode) ? source.mode : "solid";
  const normalizedValue = Number.isFinite(numericValue) ? Math.round(numericValue) : 0;
  const normalizedTop = Number.isFinite(topValue) ? Math.round(topValue) : 0;
  const normalizedBottom = Number.isFinite(bottomValue) ? Math.round(bottomValue) : 0;
  return {
    value: normalizedValue,
    verticalValue: normalizedTop === normalizedBottom ? normalizedTop : 0,
    topValue: normalizedTop,
    bottomValue: normalizedBottom,
    mode,
    microShadowPercent: normalizeMicroShadowPercent(source.microShadowPercent ?? source.micro_shadow_percent),
    color: normalizeHexColor(source.color || state.spacingColor || DEFAULT_COLOR) || DEFAULT_COLOR,
    enabled: Boolean(source.enabled && (normalizedValue !== 0 || normalizedTop !== 0 || normalizedBottom !== 0)),
    expanded: Boolean(source.expanded)
  };
}

function sidePaddingFor(item) {
  item.sidePadding = normalizeSidePadding(item.sidePadding);
  return item.sidePadding;
}

function exportSidePadding(item) {
  const padding = normalizeSidePadding(item.sidePadding);
  return {
    value: padding.enabled ? padding.value : 0,
    verticalValue: padding.enabled && padding.topValue === padding.bottomValue ? padding.topValue : 0,
    topValue: padding.enabled ? padding.topValue : 0,
    bottomValue: padding.enabled ? padding.bottomValue : 0,
    mode: padding.mode || "solid",
    microShadowPercent: normalizeMicroShadowPercent(padding.microShadowPercent),
    color: padding.color || state.spacingColor || DEFAULT_COLOR,
    enabled: Boolean(padding.enabled && (padding.value !== 0 || padding.topValue !== 0 || padding.bottomValue !== 0))
  };
}

function normalizeLayerTransform(value) {
  const source = value && typeof value === "object" ? value : {};
  const scale = Number(source.scale);
  const scaleX = Number(source.scaleX ?? source.scale_x ?? scale);
  const scaleY = Number(source.scaleY ?? source.scale_y ?? scale);
  const x = Number(source.x);
  const y = Number(source.y);
  const normalizedScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
  return {
    x: Number.isFinite(x) ? x : 0,
    y: Number.isFinite(y) ? y : 0,
    scale: normalizedScale,
    scaleX: Number.isFinite(scaleX) && scaleX > 0 ? scaleX : normalizedScale,
    scaleY: Number.isFinite(scaleY) && scaleY > 0 ? scaleY : normalizedScale
  };
}

function layerTransformFor(item) {
  item.layerTransform = normalizeLayerTransform(item.layerTransform);
  return item.layerTransform;
}

function normalizeLayerBlendMode(value) {
  return LAYER_BLEND_MODES.some(mode => mode.value === value) ? value : DEFAULT_LAYER_BLEND_MODE;
}

function layerBlendModeFor(item) {
  item.layerBlendMode = normalizeLayerBlendMode(item.layerBlendMode);
  return item.layerBlendMode;
}

function layerBlendCss(value) {
  return LAYER_BLEND_MODES.find(mode => mode.value === normalizeLayerBlendMode(value))?.css || "normal";
}

function normalizeStrokeAlign(value) {
  return STROKE_ALIGN_OPTIONS.some(option => option.value === value) ? value : DEFAULT_STROKE_ALIGN;
}

function strokeAlignFor(layer = {}) {
  layer.strokeAlign = normalizeStrokeAlign(layer.strokeAlign);
  return layer.strokeAlign;
}

function exportLayerTransform(item, scaleMultiplier = 1) {
  const transform = normalizeLayerTransform(item.layerTransform);
  const scaleX = Math.max(0.01, (transform.scaleX || transform.scale) * scaleMultiplier);
  const scaleY = Math.max(0.01, (transform.scaleY || transform.scale) * scaleMultiplier);
  return {
    x: Math.round(transform.x),
    y: Math.round(transform.y),
    scale: Math.max(0.01, transform.scale * scaleMultiplier),
    scaleX,
    scaleY
  };
}

function defaultPromptState(entry) {
  return {
    id: crypto.randomUUID(),
    type: entry.type || "image",
    path: entry.path,
    name: entry.name,
    width: entry.width,
    height: entry.height,
    format: entry.format,
    color_mode: entry.color_mode,
    url: "",
    loadStatus: "loading",
    loadError: "",
    promptStatus: "pending",
    promptText: "",
    promptError: "",
    promptProgress: 0,
    isPromptExpanded: false,
    riskStatus: "pending",
    riskText: "",
    riskMatches: [],
    riskError: "",
    isRiskExpanded: false,
    templateStatus: "pending",
    templatePath: "",
    templateUrl: "",
    templateWidth: 0,
    templateHeight: 0,
    templateError: "",
    templateCostSummary: "",
    templateCopiedOriginal: false,
    templateAspectRatio: TEMPLATE_ASPECT_OPTIONS.some(option => option.value === entry.templateAspectRatio) ? entry.templateAspectRatio : "auto",
    sidePadding: normalizeSidePadding(entry.sidePadding),
    layerTransform: normalizeLayerTransform(entry.layerTransform),
    layerInitialized: Boolean(entry.layerInitialized),
    layerBlendMode: normalizeLayerBlendMode(entry.layerBlendMode),
    replacementItems: Array.isArray(entry.replacementItems) ? entry.replacementItems : [],
    textLayer: entry.textLayer || null,
    rectLayer: entry.rectLayer || null,
    graphicPropertiesExpanded: Boolean(entry.graphicPropertiesExpanded),
    isReplacementExpanded: false,
    referenceImages: []
  };
}

function isGraphicLayer(item) {
  return item?.type === "text" || item?.type === "rect";
}

function clampAlpha(value, fallback = 1) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : fallback;
}

function alphaPercentFromInput(input, fallback = 1) {
  const text = String(input.value || "").trim();
  if (!text) return clampAlpha(fallback, 1);
  const number = Number(text);
  return Number.isFinite(number) ? clampAlpha(number / 100, fallback) : clampAlpha(fallback, 1);
}

function normalizePaint(value, fallback = "#000000") {
  const source = value && typeof value === "object" ? value : {};
  const angle = Number(source.angle);
  const alpha = clampAlpha(source.alpha, 1);
  return {
    mode: source.mode === "gradient" ? "gradient" : "solid",
    color: normalizeHexColor(source.color || fallback) || fallback,
    color2: normalizeHexColor(source.color2 || source.color || fallback) || fallback,
    alpha,
    alpha2: clampAlpha(source.alpha2, alpha),
    angle: Number.isFinite(angle) ? ((angle % 360) + 360) % 360 : 90
  };
}

function rgbaFromColorAlpha(color, alpha = 1, fallback = "#000000") {
  const normalizedColor = normalizeHexColor(color || fallback) || fallback;
  const hex = normalizedColor.replace("#", "");
  const value = hex.length === 3
    ? hex.split("").map(char => char + char).join("")
    : hex.padEnd(6, "0").slice(0, 6);
  const number = parseInt(value, 16);
  const r = (number >> 16) & 255;
  const g = (number >> 8) & 255;
  const b = number & 255;
  return `rgba(${r}, ${g}, ${b}, ${clampAlpha(alpha, 1)})`;
}

function canvasContextWithAlpha(context, paint, bounds) {
  if (paint.mode === "gradient") {
    context.globalAlpha = 1;
    const angle = ((Number(paint.angle) || 90) - 90) * Math.PI / 180;
    const cx = bounds.width / 2;
    const cy = bounds.height / 2;
    const length = Math.hypot(bounds.width, bounds.height);
    const dx = Math.cos(angle) * length / 2;
    const dy = Math.sin(angle) * length / 2;
    const gradient = context.createLinearGradient(cx - dx, cy - dy, cx + dx, cy + dy);
    gradient.addColorStop(0, rgbaFromColorAlpha(paint.color, paint.alpha));
    gradient.addColorStop(1, rgbaFromColorAlpha(paint.color2, paint.alpha2));
    return gradient;
  }
  context.globalAlpha = paint.alpha;
  return paint.color;
}

function textForRound(item, roundIndex = -1) {
  const entries = Array.isArray(item.textLayer?.replacements) ? item.textLayer.replacements : [];
  const first = entries[0] || item.textLayer?.text || TEXT_LAYER_DEFAULT_TEXT;
  if (roundIndex < 0) return item.textLayer?.text || first;
  return entries[roundIndex] || first;
}

function textReplacementCount(item) {
  if (item?.type !== "text") return 0;
  const entries = Array.isArray(item.textLayer?.replacements) ? item.textLayer.replacements : [];
  return Math.max(1, entries.length || 0);
}

function fitTextFontSize(context, text, fontFamily, fontWeight, maxWidth, maxHeight, preferredSize) {
  let size = Math.max(8, Number(preferredSize) || 48);
  while (size > 8) {
    context.font = `${fontWeight || 400} ${size}px "${fontFamily}", "Microsoft YaHei", sans-serif`;
    const metrics = context.measureText(text || " ");
    if (metrics.width <= maxWidth && size * 1.2 <= maxHeight) return size;
    size -= 1;
  }
  return size;
}

function maxTextFontSize(context, text, fontFamily, fontWeight, maxWidth, maxHeight) {
  let low = 8;
  let high = Math.max(8, Math.floor(maxHeight * 1.6));
  let best = low;
  while (low <= high) {
    const size = Math.floor((low + high) / 2);
    context.font = `${fontWeight || 400} ${size}px "${fontFamily}", "Microsoft YaHei", sans-serif`;
    const metrics = context.measureText(text || " ");
    const height = (metrics.actualBoundingBoxAscent || size) + (metrics.actualBoundingBoxDescent || size * 0.25);
    if (metrics.width <= maxWidth && height <= maxHeight) {
      best = size;
      low = size + 1;
    } else {
      high = size - 1;
    }
  }
  return best;
}

function fontCss(layer = {}, scale = 1) {
  const fontWeight = Number(layer.fontWeight) || 400;
  const fontSize = Math.max(8, Number(layer.fontSize) || 48) * scale;
  const fontFamily = layer.fontFamily || "思源黑体";
  return `${fontWeight} ${fontSize}px "${fontFamily}", "Microsoft YaHei", sans-serif`;
}

function fontCssWithSize(layer = {}, fontSize = 48, scale = 1) {
  const fontWeight = Number(layer.fontWeight) || 400;
  const fontFamily = layer.fontFamily || "思源黑体";
  return `${fontWeight} ${Math.max(8, fontSize) * scale}px "${fontFamily}", "Microsoft YaHei", sans-serif`;
}

function applyTextPreviewStroke(element, layer = {}, displayScale = 1) {
  const strokeWidth = Math.max(0, Number(layer.strokeWidth) || 0) * displayScale;
  const strokeColor = rgbaFromPaint(layer.stroke, "#000000");
  const align = strokeAlignFor(layer);
  if (strokeWidth > 0 && align === "outer") {
    element.style.webkitTextStroke = `${strokeWidth * 2}px ${strokeColor}`;
    element.style.paintOrder = "stroke fill";
  } else if (strokeWidth > 0 && align === "inner") {
    element.style.webkitTextStroke = `${strokeWidth * 2}px ${strokeColor}`;
    element.style.paintOrder = "fill stroke";
  } else {
    element.style.webkitTextStroke = `${strokeWidth}px ${strokeColor}`;
    element.style.paintOrder = "stroke fill";
  }
  element.style.textShadow = "";
}

function fittedBoxTextSize(item, text = textForRound(item)) {
  const layer = item.textLayer || {};
  const canvas = fittedBoxTextSize.canvas || (fittedBoxTextSize.canvas = document.createElement("canvas"));
  const context = canvas.getContext("2d");
  const strokeWidth = Math.max(0, Number(layer.strokeWidth) || 0);
  const inset = Math.ceil(strokeWidth) + 2;
  return maxTextFontSize(
    context,
    text,
    layer.fontFamily || "思源黑体",
    layer.fontWeight || 400,
    Math.max(1, item.width - inset * 2),
    Math.max(1, item.height - inset * 2)
  );
}

function measureTextLayer(item, text = textForRound(item)) {
  const layer = item.textLayer || {};
  const canvas = measureTextLayer.canvas || (measureTextLayer.canvas = document.createElement("canvas"));
  const context = canvas.getContext("2d");
  context.font = fontCss(layer);
  const metrics = context.measureText(text || " ");
  const strokeWidth = Math.max(0, Number(layer.strokeWidth) || 0);
  const pad = Math.ceil(strokeWidth) + 2;
  const width = Math.max(1, Math.ceil(metrics.width + pad * 2));
  const ascent = metrics.actualBoundingBoxAscent || Math.max(8, Number(layer.fontSize) || 48);
  const descent = metrics.actualBoundingBoxDescent || Math.ceil((Number(layer.fontSize) || 48) * 0.25);
  const height = Math.max(1, Math.ceil(ascent + descent + pad * 2));
  return { width, height, pad, ascent, descent };
}

function fitTextLayerBounds(item, text = textForRound(item)) {
  if (item?.type !== "text" || item.textLayer?.boxFit) return;
  const bounds = measureTextLayer(item, text);
  item.width = bounds.width;
  item.height = bounds.height;
  item.textLayer.x = bounds.pad;
  item.textLayer.y = bounds.pad;
  const transform = layerTransformFor(item);
  transform.scale = 1;
  transform.scaleX = 1;
  transform.scaleY = 1;
  item.layerTransform = transform;
}

function syncTextLayerGeometry(item, text = textForRound(item)) {
  if (item?.type !== "text") return;
  if (item.textLayer?.boxFit) {
    item.textLayer.x = 0;
    item.textLayer.y = 0;
    const transform = layerTransformFor(item);
    transform.scale = 1;
    transform.scaleX = 1;
    transform.scaleY = 1;
    item.layerTransform = transform;
    return;
  }
  fitTextLayerBounds(item, text);
}

function layerHistorySnapshot() {
  return {
    items: state.items.map(item => JSON.parse(JSON.stringify(item, (key, value) => {
      if (key === "graphicRenderTimer") return 0;
      if (key === "isPromptExpanded" || key === "isRiskExpanded") return false;
      return value;
    }))),
    selectedIds: [...state.selectedIds],
    layerBounds: { ...state.layerBounds },
    textLayerCounter: state.textLayerCounter,
    rectangleCounter: state.rectangleCounter
  };
}

function pushLayerHistorySnapshot(snapshot) {
  if (!state.layerMode || state.templateMode || !snapshot) return;
  state.layerHistory.push(snapshot);
  if (state.layerHistory.length > LAYER_HISTORY_LIMIT) state.layerHistory.shift();
}

function pushLayerHistory() {
  pushLayerHistorySnapshot(layerHistorySnapshot());
}

function restoreLayerHistorySnapshot(snapshot) {
  state.items = snapshot.items.map(item => ({
    ...item,
    sidePadding: normalizeSidePadding(item.sidePadding),
    layerTransform: normalizeLayerTransform(item.layerTransform),
    layerBlendMode: normalizeLayerBlendMode(item.layerBlendMode),
    replacementItems: Array.isArray(item.replacementItems) ? item.replacementItems : [],
    riskMatches: Array.isArray(item.riskMatches) ? item.riskMatches : [],
    templateAspectRatio: TEMPLATE_ASPECT_OPTIONS.some(option => option.value === item.templateAspectRatio) ? item.templateAspectRatio : "auto",
    referenceImages: Array.isArray(item.referenceImages) ? item.referenceImages : []
  }));
  state.pathSet = new Set(state.items.map(item => item.path).filter(Boolean));
  state.selectedIds = new Set(snapshot.selectedIds || []);
  state.layerBounds = { ...(snapshot.layerBounds || { width: 0, height: 0 }) };
  state.textLayerCounter = Math.max(0, Number(snapshot.textLayerCounter) || 0);
  state.rectangleCounter = Math.max(0, Number(snapshot.rectangleCounter) || 0);
  state.shapeDraft = null;
  state.selectionDraft = null;
  renderAll();
}

function undoLayerAction() {
  if (!state.layerMode || state.templateMode || !state.layerHistory.length) return false;
  restoreLayerHistorySnapshot(state.layerHistory.pop());
  showToast("已撤回上一步图层操作");
  return true;
}

function layerKind(item) {
  if (!item) return "";
  if (item.type === "text") return "text";
  return item.type || "image";
}

function selectedItems() {
  return state.items.filter(item => state.selectedIds.has(item.id));
}

function selectedSameKindItems(anchor) {
  const kind = layerKind(anchor);
  const selected = selectedItems();
  return selected.length > 1 && selected.every(item => layerKind(item) === kind) ? selected : [anchor].filter(Boolean);
}

async function applyToSameKindSelection(anchor, mutate, options = {}) {
  const targets = selectedSameKindItems(anchor);
  for (const target of targets) clearLayerReplacementPreview(target.id);
  for (const target of targets) mutate(target);
  await Promise.all(targets.filter(isGraphicLayer).map(target => saveGraphicItemImage(target).catch(() => {})));
  if (options.render === "all") renderAll();
  else scheduleRenderPreview();
}

function syncLayerPanelsForSelection() {
  if (!state.layerMode || state.selectedIds.size !== 1) return;
  const selected = state.items.find(item => state.selectedIds.has(item.id));
  if (!selected) return;
  for (const item of state.items) {
    if (item.id === selected.id) {
      item.graphicPropertiesExpanded = selected.type === "text";
      item.isReplacementExpanded = selected.type !== "text";
    } else {
      item.graphicPropertiesExpanded = false;
      item.isReplacementExpanded = false;
    }
  }
}

function isEditableTarget(target) {
  return Boolean(target?.closest?.("input, textarea, select, [contenteditable='true'], [contenteditable='plaintext-only']"));
}

function isLayerNudgeBlockedTarget(target) {
  return Boolean(target?.closest?.("input, textarea, select, [contenteditable='true'], [contenteditable='plaintext-only']"));
}

function setSpacePanActive(active) {
  if (!active && state.spacePanDrag) {
    refs.previewWrap?.releasePointerCapture?.(state.spacePanDrag.pointerId);
  }
  state.spacePanActive = active;
  if (!active) state.spacePanDrag = null;
  refs.previewWrap?.classList.toggle("space-pan-active", active);
  refs.previewWrap?.classList.toggle("space-pan-dragging", Boolean(active && state.spacePanDrag));
}

function handleSpacePanPointerDown(event) {
  if (!state.spacePanActive || event.button !== 0) return;
  if (!refs.previewWrap.contains(event.target)) return;
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation?.();
  state.spacePanDrag = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    scrollLeft: refs.previewWrap.scrollLeft,
    scrollTop: refs.previewWrap.scrollTop
  };
  refs.previewWrap.setPointerCapture?.(event.pointerId);
  refs.previewWrap.classList.add("space-pan-dragging");
}

function handleSpacePanPointerMove(event) {
  const drag = state.spacePanDrag;
  if (!drag || drag.pointerId !== event.pointerId) return;
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation?.();
  refs.previewWrap.scrollLeft = drag.scrollLeft - (event.clientX - drag.startX);
  refs.previewWrap.scrollTop = drag.scrollTop - (event.clientY - drag.startY);
}

function finishSpacePanDrag(event) {
  const drag = state.spacePanDrag;
  if (!drag || drag.pointerId !== event.pointerId) return;
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation?.();
  refs.previewWrap.releasePointerCapture?.(event.pointerId);
  state.spacePanDrag = null;
  refs.previewWrap.classList.remove("space-pan-dragging");
}

function lockDraftScroll() {
  state.draftScrollLock = {
    left: refs.previewWrap.scrollLeft,
    top: refs.previewWrap.scrollTop
  };
}

function restoreDraftScroll() {
  const lock = state.draftScrollLock;
  if (!lock) return;
  refs.previewWrap.scrollLeft = lock.left;
  refs.previewWrap.scrollTop = lock.top;
}

function unlockDraftScroll() {
  state.draftScrollLock = null;
}

function nudgeSelectedLayers(event) {
  if (!state.layerMode || state.templateMode || !state.selectedIds.size) return false;
  if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) return false;
  if (isLayerNudgeBlockedTarget(event.target)) return false;
  const step = event.shiftKey ? 10 : 1;
  const dx = event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
  const dy = event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0;
  pushLayerHistory();
  for (const item of state.items) {
    if (!state.selectedIds.has(item.id)) continue;
    const transform = layerTransformFor(item);
    transform.x += dx;
    transform.y += dy;
    item.layerTransform = transform;
  }
  if (!updateSelectedLayerElementPositions()) renderAll();
  else scheduleLayerSideSync([...state.selectedIds][0]);
  return true;
}

function scheduleLayerSideSync(scrollId = "") {
  clearTimeout(state.layerNudgeSideTimer);
  state.layerNudgeSideTimer = setTimeout(() => {
    state.layerNudgeSideTimer = 0;
    renderSideOnly();
    requestAnimationFrame(() => scrollListToImage(scrollId || [...state.selectedIds][0]));
  }, 140);
}

function updateSelectedLayerElementPositions() {
  const stage = refs.previewCanvas.querySelector(".layer-stage");
  if (!stage) return false;
  const displayScale = Number(stage.dataset.scale) || 0;
  if (!displayScale) return false;
  let updated = false;
  for (const item of state.items) {
    if (!state.selectedIds.has(item.id)) continue;
    const element = stage.querySelector(`.layer-item[data-id="${item.id}"]`);
    if (!element) continue;
    const transform = layerTransformFor(item);
    element.style.left = `${transform.x * displayScale}px`;
    element.style.top = `${transform.y * displayScale}px`;
    updated = true;
  }
  return updated;
}

function attachLayerResizeHandles(element, item, displayScale) {
  element.querySelectorAll(".layer-resize-handle").forEach(handle => handle.remove());
  for (const direction of ["nw", "ne", "sw", "se", "n", "e", "s", "w"]) {
    const handle = document.createElement("span");
    handle.className = `layer-resize-handle ${direction}`;
    handle.addEventListener("pointerdown", event => startLayerResize(item.id, direction, event, displayScale));
    element.appendChild(handle);
  }
}

function updateLayerStageSelection() {
  const stage = refs.previewCanvas.querySelector(".layer-stage");
  if (!stage) return false;
  const displayScale = Number(stage.dataset.scale) || 0;
  if (!displayScale) return false;
  for (const item of state.items) {
    const element = stage.querySelector(`.layer-item[data-id="${item.id}"]`);
    if (!element) continue;
    const selected = state.selectedIds.has(item.id);
    element.classList.toggle("selected", selected);
    if (selected) {
      if (!element.querySelector(".layer-resize-handle")) {
        attachLayerResizeHandles(element, item, displayScale);
      }
    } else {
      element.querySelectorAll(".layer-resize-handle").forEach(handle => handle.remove());
    }
  }
  renderLayerAlignBar();
  return true;
}

function createLayerElement(item, displayScale) {
  const selected = state.selectedIds.has(item.id);
  const transform = layerTransformFor(item);
  const layer = document.createElement("div");
  layer.className = `layer-item${selected ? " selected" : ""}`;
  layer.dataset.id = item.id;
  layer.style.left = `${transform.x * displayScale}px`;
  layer.style.top = `${transform.y * displayScale}px`;
  layer.style.width = `${item.width * (transform.scaleX || transform.scale) * displayScale}px`;
  layer.style.height = `${item.height * (transform.scaleY || transform.scale) * displayScale}px`;
  layer.style.mixBlendMode = layerBlendCss(layerBlendModeFor(item));
  layer.addEventListener("pointerdown", event => startLayerMove(item.id, event, displayScale));
  layer.addEventListener("dblclick", event => {
    if (item.type !== "text" || state.activeTool !== "move") return;
    event.preventDefault();
    event.stopPropagation();
    startInlineTextEdit(item.id, layer);
  });
  layer.addEventListener("click", event => handleLayerElementClick(item, layer, event));

  if (item.type === "text") {
    const textLayer = item.textLayer || {};
    const textPreview = document.createElement("div");
    textPreview.className = `layer-text-preview${textLayer.boxFit ? " box-fit" : ""}`;
    textPreview.textContent = textLayer.text || TEXT_LAYER_DEFAULT_TEXT;
    textPreview.style.font = textLayer.boxFit
      ? fontCssWithSize(textLayer, fittedBoxTextSize(item), displayScale)
      : fontCss(textLayer, displayScale);
    textPreview.style.lineHeight = "1";
    textPreview.style.color = rgbaFromPaint(textLayer.fill, "#000000");
    textPreview.style.textAlign = textLayer.align || "left";
    if (textLayer.boxFit) {
      textPreview.style.justifyContent = textLayer.align === "left" ? "flex-start" : textLayer.align === "right" ? "flex-end" : "center";
    }
    applyTextPreviewStroke(textPreview, textLayer, displayScale);
    if (textLayer.fill?.mode === "gradient") {
      textPreview.style.backgroundImage = paintSwatchBackground(textLayer.fill);
      textPreview.style.backgroundClip = "text";
      textPreview.style.webkitBackgroundClip = "text";
      textPreview.style.color = "transparent";
    }
    layer.appendChild(textPreview);
  } else if (item.type === "rect") {
    const rectLayer = item.rectLayer || {};
    const preview = state.layerReplacementPreview.get(item.id);
    if (preview?.url) {
      const rectImage = document.createElement("img");
      rectImage.className = "layer-rect-preview";
      rectImage.src = preview.url;
      rectImage.alt = item.name;
      rectImage.draggable = false;
      layer.appendChild(rectImage);
    } else {
      const rectPreview = document.createElement("div");
      rectPreview.className = "layer-rect-preview";
      applyRectPreviewStyle(rectPreview, rectLayer, displayScale);
      layer.appendChild(rectPreview);
    }
  } else {
    const preview = state.layerReplacementPreview.get(item.id);
    const image = document.createElement("img");
    image.src = preview?.url || item.url;
    image.alt = item.name;
    image.draggable = false;
    layer.appendChild(image);
  }
  if (selected) attachLayerResizeHandles(layer, item, displayScale);
  return layer;
}

function appendLayerItemElement(item) {
  const stage = refs.previewCanvas.querySelector(".layer-stage");
  if (!stage) return false;
  const displayScale = Number(stage.dataset.scale) || 0;
  if (!displayScale) return false;
  stage.querySelectorAll(".layer-item.selected").forEach(element => {
    element.classList.remove("selected");
    element.querySelectorAll(".layer-resize-handle").forEach(handle => handle.remove());
  });
  stage.appendChild(createLayerElement(item, displayScale));
  renderLayerAlignBar();
  return true;
}

function handleLayerElementClick(item, layer, event) {
  event.stopPropagation();
  if (state.suppressNextLayerClick) {
    state.suppressNextLayerClick = false;
    return;
  }
  if (item.type === "text" && state.activeTool === "text") {
    startInlineTextEdit(item.id, layer);
    return;
  }
  if (state.activeTool !== "move") return;
  if (event.shiftKey) {
    if (state.selectedIds.has(item.id)) state.selectedIds.delete(item.id);
    else state.selectedIds.add(item.id);
  } else {
    state.selectedIds = new Set([item.id]);
  }
  syncLayerPanelsForSelection();
  if (!updateLayerStageSelection()) renderAll();
  else {
    updateListSelectionClasses();
    scheduleLayerSideSync(item.id);
  }
  requestAnimationFrame(() => scrollListToImage(item.id));
}

function moveSelectedItemsToEdge(edge) {
  if (!state.items.length || !state.selectedIds.size) return false;
  const selected = [];
  const rest = [];
  for (const item of state.items) {
    if (state.selectedIds.has(item.id)) selected.push(item);
    else rest.push(item);
  }
  if (!selected.length) return false;
  const currentIds = state.items.map(item => item.id).join("|");
  const beforeOrder = state.layerMode ? layerHistorySnapshot() : null;
  state.items = edge === "top" ? [...rest, ...selected] : [...selected, ...rest];
  const nextIds = state.items.map(item => item.id).join("|");
  if (currentIds === nextIds) return false;
  if (state.layerMode) pushLayerHistorySnapshot(beforeOrder);
  renderAll();
  showToast(edge === "top" ? "已置顶当前图层" : "已置于底部");
  return true;
}

function handleLayerOrderShortcut(event) {
  if (!(event.ctrlKey || event.metaKey) || !event.shiftKey || isEditableTarget(event.target)) return false;
  const key = event.key;
  if (key !== "]" && key !== "】" && key !== "[" && key !== "【") return false;
  return moveSelectedItemsToEdge(key === "]" || key === "】" ? "top" : "bottom");
}

function selectEditableText(element) {
  const range = document.createRange();
  range.selectNodeContents(element);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
}

function startInlineTextEdit(itemId, layerElement) {
  const item = state.items.find(value => value.id === itemId);
  const textPreview = layerElement?.querySelector?.(".layer-text-preview");
  if (!item?.textLayer || !textPreview || textPreview.isContentEditable) return;
  state.selectedIds = new Set([itemId]);
  const original = item.textLayer.text || TEXT_LAYER_DEFAULT_TEXT;
  const beforeEdit = layerHistorySnapshot();
  textPreview.contentEditable = "true";
  textPreview.classList.add("editing");
  textPreview.textContent = original;
  textPreview.focus();
  selectEditableText(textPreview);
  let finished = false;
  const finish = async (shouldSave = true) => {
    if (finished) return;
    finished = true;
    textPreview.removeEventListener("blur", onBlur);
    textPreview.removeEventListener("keydown", onKeydown);
    const nextText = shouldSave ? (textPreview.textContent.trim() || TEXT_LAYER_DEFAULT_TEXT) : original;
    if (shouldSave && nextText !== original) pushLayerHistorySnapshot(beforeEdit);
    item.textLayer.text = nextText;
    item.textLayer.replacements = [nextText, ...(item.textLayer.replacements || []).slice(1)];
    item.name = nextText;
    syncTextLayerGeometry(item);
    await saveGraphicItemImage(item);
    renderAll();
  };
  const onBlur = () => {
    finish(true);
  };
  const onKeydown = event => {
    if (event.key === "Enter") {
      event.preventDefault();
      finish(true);
    } else if (event.key === "Escape") {
      event.preventDefault();
      finish(false);
    }
  };
  textPreview.addEventListener("blur", onBlur);
  textPreview.addEventListener("keydown", onKeydown);
}

async function graphicItemToBlob(item, roundIndex = -1) {
  if (item.type === "text") syncTextLayerGeometry(item, textForRound(item, roundIndex));
  if (item.type === "rect") materializeRectLayerSize(item);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(item.width || state.exportWidth || 790));
  canvas.height = Math.max(1, Math.round(item.height || 120));
  const context = canvas.getContext("2d");
  context.clearRect(0, 0, canvas.width, canvas.height);
  if (item.type === "text") {
    const layer = item.textLayer || {};
    const text = textForRound(item, roundIndex);
    const fill = normalizePaint(layer.fill, "#000000");
    const stroke = normalizePaint(layer.stroke, "#000000");
    const strokeWidth = Math.max(0, Number(layer.strokeWidth) || 0);
    const fontFamily = layer.fontFamily || "思源黑体";
    const fontWeight = layer.fontWeight || 400;
    const inset = Math.ceil(strokeWidth) + 2;
    const fontSize = layer.boxFit
      ? maxTextFontSize(context, text, fontFamily, fontWeight, Math.max(1, canvas.width - inset * 2), Math.max(1, canvas.height - inset * 2))
      : Math.max(8, Number(layer.fontSize) || 48);
    context.font = `${fontWeight} ${fontSize}px "${fontFamily}", "Microsoft YaHei", sans-serif`;
    const metrics = context.measureText(text || " ");
    const textHeight = (metrics.actualBoundingBoxAscent || fontSize) + (metrics.actualBoundingBoxDescent || fontSize * 0.25);
    context.textBaseline = layer.boxFit ? "alphabetic" : "top";
    context.textAlign = ["left", "center", "right"].includes(layer.align) ? layer.align : "center";
    context.lineJoin = "round";
    const x = layer.boxFit
      ? context.textAlign === "center"
        ? canvas.width / 2
        : context.textAlign === "right"
          ? canvas.width - inset
          : inset
      : context.textAlign === "center"
        ? canvas.width / 2
        : context.textAlign === "right"
          ? canvas.width
          : Math.max(0, Math.round(layer.x || 0));
    const y = layer.boxFit
      ? Math.max(inset, (canvas.height - textHeight) / 2 + (metrics.actualBoundingBoxAscent || fontSize))
      : Math.max(0, Math.round(layer.y || 0));
    const strokeAlign = strokeAlignFor(layer);
    if (strokeWidth > 0 && strokeAlign !== "inner") {
      context.lineWidth = strokeAlign === "outer" ? strokeWidth * 2 : strokeWidth;
      context.strokeStyle = canvasContextWithAlpha(context, stroke, canvas);
      context.strokeText(text, x, y);
      context.globalAlpha = 1;
    }
    context.fillStyle = canvasContextWithAlpha(context, fill, canvas);
    context.fillText(text, x, y);
    context.globalAlpha = 1;
    if (strokeWidth > 0 && strokeAlign === "inner") {
      context.save();
      context.globalCompositeOperation = "source-atop";
      context.lineWidth = strokeWidth * 2;
      context.strokeStyle = canvasContextWithAlpha(context, stroke, canvas);
      context.strokeText(text, x, y);
      context.restore();
      context.globalAlpha = 1;
    }
  } else if (item.type === "rect") {
    await drawRectGraphic(context, canvas, item.rectLayer || {}, item, roundIndex);
  }
  return canvasToBlob(canvas, "image/png");
}

async function saveGraphicItemImage(item, roundIndex = -1) {
  const blob = await graphicItemToBlob(item, roundIndex);
  if (!blob) throw new Error("图层生成失败");
  const dataBase64 = arrayBufferToBase64(await blob.arrayBuffer());
  const path = isTauri()
    ? await invoke("save_pasted_image", { dataBase64, extension: "png" })
    : `browser-file:graphic-layer:${item.id}:${Date.now()}`;
  if (item.url?.startsWith("blob:")) URL.revokeObjectURL(item.url);
  item.path = path;
  item.url = isTauri() ? await invoke("read_image_data_url", { path }) : URL.createObjectURL(blob);
  item.format = "PNG";
  item.color_mode = "image/png";
  item.loadStatus = "ready";
  state.pathSet.add(path);
  return path;
}

function roundedRectPath(context, x, y, width, height, radius) {
  const r = Math.max(0, Math.min(radius || 0, width / 2, height / 2));
  context.beginPath();
  context.moveTo(x + r, y);
  context.lineTo(x + width - r, y);
  context.quadraticCurveTo(x + width, y, x + width, y + r);
  context.lineTo(x + width, y + height - r);
  context.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  context.lineTo(x + r, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - r);
  context.lineTo(x, y + r);
  context.quadraticCurveTo(x, y, x + r, y);
  context.closePath();
}

async function drawRectGraphic(context, canvas, layer, item, roundIndex = -1) {
  const fill = normalizePaint(layer.fill, "#FFFFFF");
  const stroke = normalizePaint(layer.stroke, "#FFFFFF");
  const strokeWidth = Math.max(0, Number(layer.strokeWidth) || 0);
  const strokeAlign = strokeAlignFor(layer);
  const radius = Math.max(0, Number(layer.radius) || 0);
  const blur = Math.max(0, Number(layer.blur) || 0);
  const blurInset = Math.ceil(blur);
  const strokeInset = strokeAlign === "inner" ? strokeWidth : strokeAlign === "center" ? strokeWidth / 2 : 0;
  const inset = Math.ceil(strokeInset) + blurInset;
  const width = Math.max(1, canvas.width - inset * 2);
  const height = Math.max(1, canvas.height - inset * 2);
  const drawCanvas = blur > 0 ? document.createElement("canvas") : canvas;
  if (blur > 0) {
    drawCanvas.width = canvas.width;
    drawCanvas.height = canvas.height;
  }
  const drawContext = blur > 0 ? drawCanvas.getContext("2d") : context;
  roundedRectPath(drawContext, inset, inset, width, height, Math.max(0, radius - strokeInset));
  const replacement = roundIndex >= 0 ? item.replacementItems?.[roundIndex] : null;
  if (replacement?.type === "image" && (replacement.previewUrl || replacement.url)) {
    const image = new Image();
    image.src = replacement.previewUrl || replacement.url;
    await image.decode().catch(() => null);
    if (image.naturalWidth && image.naturalHeight) {
      if (blur > 0) {
        const contentCanvas = document.createElement("canvas");
        contentCanvas.width = canvas.width;
        contentCanvas.height = canvas.height;
        const contentContext = contentCanvas.getContext("2d");
        const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
        const drawWidth = image.naturalWidth * scale;
        const drawHeight = image.naturalHeight * scale;
        contentContext.drawImage(image, inset + (width - drawWidth) / 2, inset + (height - drawHeight) / 2, drawWidth, drawHeight);
        const maskCanvas = document.createElement("canvas");
        maskCanvas.width = canvas.width;
        maskCanvas.height = canvas.height;
        const maskContext = maskCanvas.getContext("2d");
        maskContext.filter = `blur(${blur}px)`;
        maskContext.fillStyle = "#fff";
        roundedRectPath(maskContext, inset, inset, width, height, Math.max(0, radius - strokeInset));
        maskContext.fill();
        contentContext.globalCompositeOperation = "destination-in";
        contentContext.drawImage(maskCanvas, 0, 0);
        contentContext.globalCompositeOperation = "source-over";
        context.drawImage(contentCanvas, 0, 0);
        if (strokeWidth > 0) {
          const strokePathInset = blurInset + strokeWidth / 2;
          const strokePathWidth = Math.max(1, canvas.width - strokePathInset * 2);
          const strokePathHeight = Math.max(1, canvas.height - strokePathInset * 2);
          context.beginPath();
          roundedRectPath(context, strokePathInset, strokePathInset, strokePathWidth, strokePathHeight, Math.max(0, radius - (strokeAlign === "inner" ? strokeWidth / 2 : 0)));
          context.lineWidth = strokeWidth;
          context.strokeStyle = canvasContextWithAlpha(context, stroke, canvas);
          context.stroke();
          context.globalAlpha = 1;
        }
        return;
      }
      drawContext.save();
      drawContext.clip();
      const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
      const drawWidth = image.naturalWidth * scale;
      const drawHeight = image.naturalHeight * scale;
      drawContext.drawImage(image, inset + (width - drawWidth) / 2, inset + (height - drawHeight) / 2, drawWidth, drawHeight);
      drawContext.restore();
    }
  } else {
    drawContext.fillStyle = canvasContextWithAlpha(drawContext, fill, drawCanvas);
    drawContext.fill();
    drawContext.globalAlpha = 1;
  }
  if (strokeWidth > 0) {
    const strokePathInset = blurInset + (strokeAlign === "outer" ? strokeWidth / 2 : strokeAlign === "inner" ? strokeWidth / 2 : strokeWidth / 2);
    const strokePathWidth = Math.max(1, canvas.width - strokePathInset * 2);
    const strokePathHeight = Math.max(1, canvas.height - strokePathInset * 2);
    drawContext.beginPath();
    roundedRectPath(drawContext, strokePathInset, strokePathInset, strokePathWidth, strokePathHeight, Math.max(0, radius - (strokeAlign === "inner" ? strokeWidth / 2 : 0)));
    drawContext.lineWidth = strokeWidth;
    drawContext.strokeStyle = canvasContextWithAlpha(drawContext, stroke, drawCanvas);
    drawContext.stroke();
    drawContext.globalAlpha = 1;
  }
  if (blur > 0) {
    context.save();
    context.filter = `blur(${blur}px)`;
    context.drawImage(drawCanvas, 0, 0);
    context.restore();
  }
}

function loadPreviewUrl(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = url;
  });
}

async function replacementEffectPreviewUrl(item, replacement, index) {
  if (!replacement || replacement.type !== "image") return replacement?.previewUrl || replacement?.url || "";
  if (isGraphicLayer(item)) {
    const blob = await graphicItemToBlob(item, index);
    return blob ? URL.createObjectURL(blob) : replacement.previewUrl || replacement.url || "";
  }
  const sourceUrl = replacement.previewUrl || replacement.url;
  if (!sourceUrl) return "";
  const image = await loadPreviewUrl(sourceUrl);
  const width = Math.max(1, Math.round(Number(item.width) || image.naturalWidth || 1));
  const height = Math.max(1, Math.round(Number(item.height) || image.naturalHeight || 1));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  context.fillStyle = state.backgroundColor || DEFAULT_COLOR;
  context.fillRect(0, 0, width, height);
  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
  const drawWidth = image.naturalWidth * scale;
  const drawHeight = image.naturalHeight * scale;
  context.drawImage(image, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
  const blob = await canvasToBlob(canvas, "image/png");
  return blob ? URL.createObjectURL(blob) : sourceUrl;
}

function clearLayerReplacementPreview(itemId = "") {
  const entries = itemId ? [[itemId, state.layerReplacementPreview.get(itemId)]] : Array.from(state.layerReplacementPreview.entries());
  for (const [id, preview] of entries) {
    if (preview?.url?.startsWith("blob:")) URL.revokeObjectURL(preview.url);
    state.layerReplacementPreview.delete(id);
  }
}

function getSelectedItems() {
  return state.items.filter(item => state.selectedIds.has(item.id));
}

function longStitchInsertIndexAfterSelection() {
  if (state.layerMode) return state.items.length;
  if (!state.selectedIds.size) return state.items.length;
  let index = -1;
  for (let current = 0; current < state.items.length; current += 1) {
    if (state.selectedIds.has(state.items[current].id)) {
      index = current;
    }
  }
  return index >= 0 ? index + 1 : state.items.length;
}

function canvasToBlob(canvas, type = "image/png", quality) {
  return new Promise(resolve => canvas.toBlob(resolve, type, quality));
}

function createCarouselSeparatorCanvas(width = 790) {
  const canvas = document.createElement("canvas");
  const safeWidth = Math.max(320, Math.round(width || 790));
  const height = Math.max(120, Math.round(safeWidth * 0.18));
  canvas.width = safeWidth;
  canvas.height = height;
  const context = canvas.getContext("2d");
  context.fillStyle = "#FFFFFF";
  context.fillRect(0, 0, safeWidth, height);
  context.fillStyle = "#FF0000";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.font = `700 ${Math.max(26, Math.round(safeWidth * 0.038))}px "Microsoft YaHei", "PingFang SC", Arial, sans-serif`;
  context.fillText("轮播海报", safeWidth / 2, height / 2);
  return canvas;
}

function shouldShowTopTemplateButtons() {
  return !state.layerMode && state.exportMode === "long" && Math.round(Number(state.exportWidth) || 0) === 1920;
}

async function insertCarouselSeparator() {
  if (!shouldShowTopTemplateButtons()) return;
  try {
    const width = Math.max(1, Math.round(state.exportWidth || 790));
    const canvas = createCarouselSeparatorCanvas(width);
    const blob = await canvasToBlob(canvas, "image/png");
    if (!blob) throw new Error("分隔图生成失败");
    const dataBase64 = arrayBufferToBase64(await blob.arrayBuffer());
    const path = isTauri()
      ? await invoke("save_pasted_image", { dataBase64, extension: "png" })
      : `browser-file:carousel-separator:${Date.now()}`;
    const url = URL.createObjectURL(blob);
    const item = defaultPromptState({
      path,
      name: "轮播海报分隔.png",
      width: canvas.width,
      height: canvas.height,
      format: "PNG",
      color_mode: "image/png"
    });
    item.url = url;
    item.loadStatus = "ready";
    item.promptStatus = "done";
    item.promptText = "轮播海报分隔标题";
    item.riskStatus = "done";
    item.riskText = "";
    item.riskMatches = [];
    const insertIndex = longStitchInsertIndexAfterSelection();
    state.items.splice(insertIndex, 0, item);
    state.pathSet.add(item.path);
    state.selectedIds = new Set([item.id]);
    renderAll();
  } catch (error) {
    showToast(`轮播分隔添加失败：${error.message || error}`);
  }
}

async function insertCommonShopHeader() {
  if (!shouldShowTopTemplateButtons()) return;
  try {
    setStatus("正在添加1688通用店招...");
    const existingIndex = state.items.findIndex(item => item.isCommonShopHeader);
    if (existingIndex >= 0) {
      const [existing] = state.items.splice(existingIndex, 1);
      state.items.unshift(existing);
      state.selectedIds = new Set([existing.id]);
      renderAll();
      setStatus("");
      showToast("已将1688通用店招移到顶部");
      return;
    }

    const response = await fetch(commonShopHeaderUrl);
    if (!response.ok) throw new Error("店招图片读取失败");
    const blob = await response.blob();
    const dataBase64 = arrayBufferToBase64(await blob.arrayBuffer());
    const path = isTauri()
      ? await invoke("save_pasted_image", { dataBase64, extension: "jpg" })
      : `browser-file:common-shop-header:${Date.now()}`;
    const item = defaultPromptState({
      path,
      name: "1688通用店招.jpg",
      width: 1920,
      height: 204,
      format: "JPG",
      color_mode: "image/jpeg"
    });
    item.url = isTauri() ? await invoke("read_image_data_url", { path }) : URL.createObjectURL(blob);
    item.loadStatus = "ready";
    item.promptStatus = "done";
    item.promptText = "1688通用店招";
    item.riskStatus = "done";
    item.riskText = "";
    item.riskMatches = [];
    item.isCommonShopHeader = true;
    state.items.unshift(item);
    state.pathSet.add(item.path);
    state.selectedIds = new Set([item.id]);
    renderAll();
    setStatus("");
    showToast("已添加1688通用店招到顶部");
  } catch (error) {
    setStatus("");
    showToast(`1688通用店招添加失败：${error.message || error}`);
  }
}

function showToast(message) {
  refs.toast.textContent = message;
  refs.toast.classList.add("show");
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => refs.toast.classList.remove("show"), 2600);
}

function setStatus(message) {
  refs.bottomStatus.textContent = message;
}

function updateApiStatus() {
  const promptConfigured = Boolean(getPromptApiConfig().api_key);
  const riskConfigured = Boolean(getRiskApiConfig().api_key);
  const imageConfigured = Boolean(getImageApiConfig().api_key);
  const configured = [promptConfigured, riskConfigured, imageConfigured].filter(Boolean).length;
  refs.apiStatus.textContent = configured
    ? `已配置 ${configured}/3 个 API`
    : "未配置 API，提示词、生图和极限词 OCR 功能受限";
}

function compareVersions(left, right) {
  const parse = value => String(value || "")
    .split(/[.-]/)
    .map(part => {
      const numeric = Number.parseInt(part.replace(/\D/g, ""), 10);
      return Number.isFinite(numeric) ? numeric : 0;
    });
  const l = parse(left);
  const r = parse(right);
  const length = Math.max(l.length, r.length);
  for (let index = 0; index < length; index += 1) {
    const diff = (l[index] || 0) - (r[index] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function normalizeUpdateManifest(value, baseUrl) {
  const source = value && typeof value === "object" ? value : {};
  const version = String(source.version || "").trim();
  const rawUrl = String(source.url || source.download_url || source.downloadUrl || "").trim();
  if (!version || !rawUrl) return null;
  const url = new URL(rawUrl, baseUrl).toString();
  const rawNotes = source.notes || source.changelog || "";
  return {
    version,
    url,
    file_name: String(source.file_name || source.fileName || "").trim(),
    notes: Array.isArray(rawNotes) ? rawNotes.join("\n") : String(rawNotes).trim()
  };
}

function renderUpdateNotice() {
  if (!refs.updateNoticeBtn) return;
  const hasUpdate = Boolean(state.updateInfo);
  refs.updateNoticeBtn.hidden = !hasUpdate;
  if (hasUpdate) {
    refs.updateNoticeBtn.textContent = `发现更新 ${state.updateInfo.version}`;
  }
}

async function checkForUpdates(manual = false) {
  const inputManifestUrl = refs.settingsModal?.classList.contains("show")
    ? String(refs.updateManifestUrlInput?.value || "").trim()
    : "";
  const manifestUrl = inputManifestUrl || String(state.config.update?.manifest_url || "").trim() || DEFAULT_UPDATE_MANIFEST_URL;
  state.config.update = { ...(state.config.update || {}), manifest_url: manifestUrl };
  if (refs.updateManifestUrlInput && !refs.updateManifestUrlInput.value.trim()) {
    refs.updateManifestUrlInput.value = manifestUrl;
  }
  if (!manifestUrl || state.updateChecking) {
    if (manual && !manifestUrl) showToast("请先在设置中填写局域网更新地址");
    return;
  }
  state.updateChecking = true;
  if (manual) showToast("正在检查更新...");
  try {
    const requestUrl = `${manifestUrl}${manifestUrl.includes("?") ? "&" : "?"}t=${Date.now()}`;
    const rawManifest = isTauri()
      ? await invoke("fetch_update_manifest", { url: requestUrl })
      : await fetch(requestUrl, { cache: "no-store" }).then(response => {
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          return response.json();
        });
    const manifest = normalizeUpdateManifest(rawManifest, manifestUrl);
    if (manifest && compareVersions(manifest.version, CURRENT_APP_VERSION) > 0) {
      state.updateInfo = manifest;
      renderUpdateNotice();
      if (manual) showToast(`发现新版本 ${manifest.version}`);
      if (!manual && state.updatePromptedVersion !== manifest.version) {
        state.updatePromptedVersion = manifest.version;
        window.setTimeout(() => {
          if (state.updateInfo?.version === manifest.version) openUpdatePrompt();
        }, 600);
      }
      return;
    }
    state.updateInfo = null;
    renderUpdateNotice();
    if (manual) showToast("当前已是最新版本");
  } catch (error) {
    if (manual) showToast(`检查更新失败：${error.message || error}`);
  } finally {
    state.updateChecking = false;
  }
}

function openUpdatePrompt() {
  if (!state.updateInfo) {
    checkForUpdates(true);
    return;
  }
  const notes = state.updateInfo.notes || "暂无更新内容说明";
  openConfirm(
    `发现新版本 ${state.updateInfo.version}`,
    `当前版本：${CURRENT_APP_VERSION}\n新版本：${state.updateInfo.version}\n\n更新内容：\n${notes}\n\n是否下载更新文件？`,
    "下载更新",
    downloadAvailableUpdate
  );
}

async function downloadAvailableUpdate() {
  if (!state.updateInfo || state.updateDownloading) return;
  state.updateDownloading = true;
  showToast("正在下载更新...");
  try {
    const result = await invoke("download_update_file", {
      url: state.updateInfo.url,
      fileName: state.updateInfo.file_name || undefined
    });
    showToast(`更新已下载：${result.path}`);
    await openTargetFolder(result.path);
  } catch (error) {
    showToast(`下载更新失败：${error.message || error}`);
  } finally {
    state.updateDownloading = false;
  }
}

async function openTargetFolder(path) {
  if (!isTauri() || !path) return;
  try {
    await invoke("open_target_folder", { path });
  } catch {
    // Opening the folder is a convenience action; export/download success should stand.
  }
}

function readableApiError(error) {
  const raw = String(error?.message || error || "");
  const lower = raw.toLowerCase();
  if (raw.includes("401")) {
    return "API Key 无效，或 Base URL 与 Key 不匹配。";
  }
  if (raw.includes("400") && (lower.includes("model does not exist") || lower.includes("model_not_found") || lower.includes("model not found"))) {
    return "模型名称错误，或当前账号不可用这个模型。";
  }
  if (lower.includes("acl") || lower.includes("not allowed")) {
    return "当前模型或接口不支持图片理解，请更换 VL / Vision 多模态模型。";
  }
  return raw || "未知错误";
}

function readableOcrError(error) {
  const message = readableApiError(error).trim();
  if (!message || /[�锛鎬鎸鍔兘褰撳墠涓呮牸绗棰勬湡]/.test(message)) {
    return "识别失败，请检查图片是否可读取，或更换 OCR / 极限词 API 设置。";
  }
  return message;
}

function cleanOcrText(text) {
  const withoutModelTags = String(text || "")
    .replace(/<\|[^|>]+\|>/g, "")
    .replace(/<\|[^>]*$/g, "")
    .replace(/^\s*[{}]\s*/gm, "")
    .replace(/^\s*\d+(?:\s+\d+)*\s*$/gm, "");
  const lines = withoutModelTags
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);
  const cleaned = [];
  const seenLines = new Set();
  for (const line of lines) {
    if (seenLines.has(line)) continue;
    seenLines.add(line);
    cleaned.push(line);
  }
  return cleaned.join("\n").trim();
}

function decodeBasicHtmlEntities(text) {
  return String(text || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function cleanGeneratedPromptText(text) {
  const withoutTags = decodeBasicHtmlEntities(text)
    .replace(/<\|[^|>]+\|>/g, "")
    .replace(/<\/?(p|br|div|li|ol|ul|h[1-6])[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/^\s*[{}]\s*/gm, "");
  const lines = withoutTags
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line && !/^([0-9{}|\\/\]\[，。！？、；：()\s]+){8,}$/.test(line));
  const cleaned = [];
  const seenLines = new Set();
  for (const line of lines) {
    const key = line.replace(/\s+/g, "");
    if (seenLines.has(key)) continue;
    seenLines.add(key);
    cleaned.push(line);
  }
  return cleaned.join("\n\n").trim();
}

function isCompleteApiConfig(api) {
  return Boolean(api?.api_key?.trim() && api?.base_url?.trim() && api?.model?.trim());
}

function renderPromptTemplateModal() {
  const settings = state.promptTemplateSettings;
  refs.extractModeRadio.checked = settings.mode === "extract";
  refs.templateModeRadio.checked = settings.mode === "template";
  refs.extractPromptInput.value = settings.extractText || DEFAULT_EXTRACT_PROMPT;
  refs.templatePromptInput.value = settings.templateText || "";
  syncPromptTemplateMode();
  renderPresetTags();
}

function syncPromptTemplateMode() {
  const templateEnabled = refs.templateModeRadio.checked;
  refs.extractPromptInput.disabled = templateEnabled;
  refs.templatePromptInput.disabled = !templateEnabled;
  refs.extractPromptInput.classList.toggle("disabled", templateEnabled);
  refs.templatePromptInput.classList.toggle("disabled", !templateEnabled);
  refs.templateActionRow.hidden = false;
  refs.savePresetBtn.disabled = !refs.templatePromptInput.value.trim();
}

function renderPresetTags() {
  refs.presetTagList.innerHTML = "";
  for (const preset of state.promptTemplateSettings.presets) {
    const tag = document.createElement("button");
    tag.type = "button";
    tag.className = "preset-tag";
    tag.dataset.id = preset.id;
    tag.textContent = preset.label || presetLabel(preset.content);
    tag.title = preset.content;
    tag.addEventListener("click", () => applyPreset(preset.id));
    tag.addEventListener("contextmenu", event => openPresetMenu(event, preset.id));
    refs.presetTagList.appendChild(tag);
  }
}

function openPromptTemplateModal() {
  closePresetMenu();
  renderPromptTemplateModal();
  refs.promptTemplateModal.classList.add("show");
}

function closePromptTemplateModal() {
  savePromptTemplateSettings(false);
  closePresetMenu();
  refs.promptTemplateModal.classList.remove("show");
}

async function savePromptTemplateFromModal() {
  savePromptTemplateSettings(true);
  syncPromptTemplateMode();
  const text = refs.templateModeRadio.checked ? refs.templatePromptInput.value : refs.extractPromptInput.value;
  await copyText(text);
  showToast("已复制");
}

function clearPromptTemplateInput() {
  if (refs.templateModeRadio.checked) {
    refs.templatePromptInput.value = "";
    state.promptTemplateSettings.templateText = "";
    state.promptTemplateSettings.savedTemplateText = "";
    refs.templatePromptInput.focus();
  } else {
    refs.extractPromptInput.value = "";
    state.promptTemplateSettings.extractText = "";
    refs.extractPromptInput.focus();
  }
  savePromptTemplateSettings(false);
  syncPromptTemplateMode();
  showToast("已清除当前输入框");
}

function savePresetFromModal() {
  state.promptTemplateSettings.templateText = refs.templatePromptInput.value;
  const preset = saveTemplateAsPreset(state.promptTemplateSettings.templateText, true);
  if (preset) {
    state.promptTemplateSettings.savedTemplateText = state.promptTemplateSettings.templateText;
    savePromptTemplateSettings(false);
  }
  renderPresetTags();
}

async function exportPromptTemplateSettings() {
  const format = refs.promptTemplateExportFormatSelect.value || "json";
  const outputPath = await save({
    defaultPath: `提示词模版.${format}`,
    filters: [
      { name: "JSON", extensions: ["json"] },
      { name: "TXT", extensions: ["txt"] },
      { name: "CSV", extensions: ["csv"] }
    ]
  });
  if (!outputPath) return;
  try {
    await invoke("export_text_file", {
      path: outputPath,
      content: serializePromptTemplateSettings(format)
    });
    showToast(`已导出 ${format.toUpperCase()} 模板，共 ${promptTemplateCount()} 个模板`);
  } catch (error) {
    showToast(`导出失败：${error}`);
  }
}

async function importPromptTemplateSettings(file) {
  if (!file) return;
  try {
    const text = await file.text();
    const incoming = parsePromptTemplateFile(text, file.name);
    const mode = refs.promptTemplateImportModeSelect.value || "append";
    state.promptTemplateSettings = mode === "replace"
      ? normalizePromptTemplateSettings(incoming)
      : mergePromptTemplateSettings(state.promptTemplateSettings, incoming);
    renderPromptTemplateModal();
    savePromptTemplateSettings(false);
    const action = mode === "replace" ? "覆盖" : "追加";
    showToast(`提示词模板${action}导入成功，当前共 ${promptTemplateCount()} 个模板`);
  } catch {
    showToast("模板格式不正确，请使用 JSON、TXT 或 CSV");
  }
}

function applyPreset(presetId) {
  const preset = state.promptTemplateSettings.presets.find(item => item.id === presetId);
  if (!preset) return;
  const current = refs.templatePromptInput.value.trim();
  if (current && current !== state.promptTemplateSettings.savedTemplateText && !hasPresetContent(current)) {
    saveTemplateAsPreset(current, false);
  }
  state.promptTemplateSettings.mode = "template";
  state.promptTemplateSettings.templateText = preset.content;
  state.promptTemplateSettings.savedTemplateText = preset.content;
  refs.templateModeRadio.checked = true;
  refs.extractModeRadio.checked = false;
  refs.templatePromptInput.value = preset.content;
  savePromptTemplateSettings(false);
  syncPromptTemplateMode();
  renderPresetTags();
}

function openPresetMenu(event, presetId) {
  event.preventDefault();
  state.presetMenuId = presetId;
  refs.presetContextMenu.style.left = `${event.clientX}px`;
  refs.presetContextMenu.style.top = `${event.clientY}px`;
  refs.presetContextMenu.classList.add("show");
}

function closePresetMenu() {
  refs.presetContextMenu.classList.remove("show");
  state.presetMenuId = "";
}

function renameSelectedPreset() {
  const preset = state.promptTemplateSettings.presets.find(item => item.id === state.presetMenuId);
  if (!preset) return;
  const next = prompt("请输入新的标签名称", preset.label || presetLabel(preset.content));
  if (next === null) return;
  const label = next.trim();
  if (!label) {
    showToast("标签名称不能为空");
    return;
  }
  preset.label = label;
  savePromptTemplateSettings(false);
  renderPresetTags();
  closePresetMenu();
}

function deleteSelectedPreset() {
  const presetId = state.presetMenuId;
  const preset = state.promptTemplateSettings.presets.find(item => item.id === presetId);
  if (!preset) return;
  openConfirm("删除预设标签？", "是否删除当前预设标签？", "删除", () => {
    state.promptTemplateSettings.presets = state.promptTemplateSettings.presets.filter(item => item.id !== presetId);
    savePromptTemplateSettings(false);
    renderPresetTags();
    closePresetMenu();
  });
}

function syncInputs() {
  const hideStitchControls = state.layerMode || state.ledgerMode;
  refs.spacingInput.value = state.spacing > 0 ? String(state.spacing) : "";
  refs.spacingFillModeSelect.value = state.spacingFillMode || DEFAULT_SPACING_FILL_MODE;
  refs.spacingMicroShadowInput.value = String(normalizeMicroShadowPercent(state.spacingMicroShadowPercent));
  refs.colorInput.value = state.spacingColor;
  refs.colorSwatch.style.background = state.spacingColor;
  refs.spacingInput.hidden = hideStitchControls;
  refs.spacingApplyBtn.hidden = hideStitchControls;
  refs.spacingFillModeSelect.hidden = hideStitchControls;
  refs.spacingMicroShadowInput.hidden = hideStitchControls || state.spacingFillMode !== "microShadow";
  refs.spacingFillHint.hidden = hideStitchControls;
  refs.bottomSpacer.hidden = hideStitchControls;
  for (const element of document.querySelectorAll(".solid-fill-control")) {
    element.hidden = hideStitchControls || state.spacingFillMode !== "solid";
  }
  const presetWidths = new Set(["750", "790", "800", "1920"]);
  const widthText = String(state.exportWidth);
  const isCustomWidth = state.customExportWidth || !presetWidths.has(widthText);
  refs.exportWidthSelect.value = isCustomWidth ? "custom" : widthText;
  refs.exportWidthSelect.hidden = hideStitchControls;
  refs.customExportWidthInput.hidden = hideStitchControls || !isCustomWidth;
  refs.customExportWidthInput.value = isCustomWidth ? widthText : "";
  refs.exportModeSelect.value = state.exportMode;
  refs.exportModeSelect.hidden = hideStitchControls;
  const hideTopTemplateButtons = !shouldShowTopTemplateButtons();
  refs.carouselSeparatorBtn.hidden = hideTopTemplateButtons;
  refs.commonShopHeaderBtn.hidden = hideTopTemplateButtons;
  refs.saveBtn.hidden = hideStitchControls;
  refs.zoomLabel.textContent = `${Math.round(state.previewZoom * 100)}%`;
  const running = state.batchQueue.length > 0 || state.items.some(item => item.promptStatus === "generating" || item.promptStatus === "queued");
  refs.generateAllBtn.textContent = running ? "生成中..." : "生成提示词";
  refs.copyAllBtn.disabled = state.items.filter(item => item.promptStatus === "done" && item.promptText).length < 2;
  refs.inspectAllBtn.textContent = state.riskBatchRunning ? "排查中..." : "排查极限词";
  refs.inspectAllBtn.disabled = !state.items.length;
  refs.batchReplaceBtn.classList.toggle("active", state.batchReplaceMode);
  refs.layerTemplateBtn.classList.toggle("active", state.layerMode);
  refs.replacementExportBtn.hidden = state.ledgerMode || !(hasReplacementItems() || state.layerMode);
  refs.toolRail.hidden = state.templateMode || !state.layerMode;
  refs.moveToolBtn.classList.toggle("active", state.activeTool === "move");
  refs.textToolBtn.classList.toggle("active", state.activeTool === "text");
  refs.rectToolBtn.classList.toggle("active", state.activeTool === "rect");
  refs.previewWrap.classList.toggle("tool-text-active", state.activeTool === "text" && !state.templateMode);
  refs.previewWrap.classList.toggle("tool-rect-active", state.activeTool === "rect" && !state.templateMode);
  refs.riskPanel.hidden = state.listActionMode !== "risk";
  const promptDoneCount = state.items.filter(item => item.promptStatus === "done" && item.promptText).length;
  refs.startTemplateBtn.disabled = promptDoneCount < 1 || state.templateRunning;
  refs.startTemplateBtn.textContent = promptDoneCount < 1 ? "请等待提示词提取完成" : "一键套版";
  refs.templatePromptStatus.textContent = state.items.length ? `已完成提示词 ${promptDoneCount}/${state.items.length}` : "";
  refs.exportTemplateBtn.hidden = state.ledgerMode || !state.items.some(item => ["done", "copied"].includes(item.templateStatus) && item.templatePath);
  refs.exitTemplateBtn.hidden = state.ledgerMode || !state.templateMode;
  refs.costLedgerBtn.classList.toggle("active", state.ledgerMode);
  refs.ledgerBackBtn.hidden = !state.ledgerMode;
  refs.addImagesBtn.hidden = state.ledgerMode;
  refs.addFolderBtn.hidden = state.ledgerMode;
  refs.clearBtn.hidden = state.ledgerMode;
  refs.bottomStatus.hidden = state.ledgerMode;
  refs.zoomOutBtn.hidden = state.ledgerMode;
  refs.zoomInBtn.hidden = state.ledgerMode;
  refs.zoomLabel.hidden = state.ledgerMode;
  refs.apiStatus.hidden = state.ledgerMode;
}

function showDropPage() {
  refs.ledgerPage.hidden = !state.ledgerMode;
  refs.dropPage.hidden = state.ledgerMode ? true : false;
  refs.previewPage.hidden = true;
  if (state.ledgerMode) renderLedgerPage();
}

function showPreviewPage() {
  refs.ledgerPage.hidden = !state.ledgerMode;
  refs.dropPage.hidden = true;
  refs.previewPage.hidden = state.ledgerMode;
  if (state.ledgerMode) renderLedgerPage();
}

function setActiveTool(tool) {
  state.activeTool = ["move", "text", "rect"].includes(tool) ? tool : "move";
  state.shapeDraft = null;
  state.snapGuides = [];
  syncInputs();
}

function collapseGraphicPanels(exceptId = "") {
  for (const item of state.items) {
    if (item.id !== exceptId) {
      item.graphicPropertiesExpanded = false;
      item.isReplacementExpanded = false;
    }
  }
}

function previewPoint(event) {
  const stage = refs.previewCanvas.querySelector(".layer-stage");
  const rect = (state.layerMode && stage ? stage : refs.previewCanvas).getBoundingClientRect();
  return {
    x: Math.max(0, event.clientX - rect.left),
    y: Math.max(0, event.clientY - rect.top),
    rect
  };
}

function displayScaleForCurrentPreview() {
  if (state.layerMode) {
    const bounds = ensureLayerBounds(false);
    const fitWidth = Math.max(280, refs.previewWrap.clientWidth - 72);
    const fitHeight = Math.max(220, refs.previewWrap.clientHeight - 92);
    const baseScale = Math.min(fitWidth / bounds.width, fitHeight / bounds.height, 1);
    return Math.max(0.02, baseScale * state.previewZoom);
  }
  const fitWidth = Math.max(280, refs.previewWrap.clientWidth - 48);
  return Math.max(0.01, Math.round(fitWidth * state.previewZoom) / Math.max(1, state.exportWidth || 790));
}

function layerInsertIndexForGraphic() {
  return state.items.length;
}

async function addTextLayerFromDraft(draft) {
  if (!state.layerMode || state.templateMode || state.activeTool !== "text") return;
  pushLayerHistory();
  const scale = displayScaleForCurrentPreview();
  const minX = Math.min(draft.startX, draft.endX);
  const minY = Math.min(draft.startY, draft.endY);
  const dragWidth = Math.abs(draft.endX - draft.startX);
  const dragHeight = Math.abs(draft.endY - draft.startY);
  const hasBox = dragWidth >= 8 && dragHeight >= 8;
  state.textLayerCounter += 1;
  const x = Math.round((hasBox ? minX : draft.startX) / scale);
  const y = Math.round((hasBox ? minY : draft.startY) / scale);
  const width = hasBox ? Math.max(24, Math.round(dragWidth / scale)) : 360;
  const height = hasBox ? Math.max(24, Math.round(dragHeight / scale)) : 96;
  const item = defaultPromptState({
    type: "text",
    path: `graphic:text:${Date.now()}`,
    name: TEXT_LAYER_DEFAULT_TEXT,
    width,
    height,
    format: "PNG",
    color_mode: "image/png",
    textLayer: {
      text: TEXT_LAYER_DEFAULT_TEXT,
      replacements: [TEXT_LAYER_DEFAULT_TEXT],
      fontFamily: "思源黑体",
      fontWeight: 400,
      fontSize: hasBox ? Math.max(12, Math.min(48, Math.floor(height * 0.55))) : 48,
      boxFit: hasBox,
      x: 0,
      y: 0,
      align: "center",
      fill: normalizePaint(null, "#000000"),
      stroke: normalizePaint(null, "#000000"),
      strokeWidth: 0,
      strokeAlign: DEFAULT_STROKE_ALIGN
    },
    layerTransform: { x, y, scale: 1, scaleX: 1, scaleY: 1 },
    layerInitialized: true,
    graphicPropertiesExpanded: true
  });
  item.promptStatus = "done";
  item.riskStatus = "done";
  item.riskMatches = [];
  item.loadStatus = "ready";
  syncTextLayerGeometry(item);
  collapseGraphicPanels(item.id);
  state.items.splice(layerInsertIndexForGraphic(), 0, item);
  state.selectedIds = new Set([item.id]);
  await saveGraphicItemImage(item);
  if (!appendLayerItemElement(item)) renderAll();
  else renderSideOnly();
  requestAnimationFrame(() => {
    const input = refs.imageList.querySelector(`[data-id="${item.id}"] .graphic-text-input`);
    if (input) {
      input.focus();
      input.select();
    }
  });
}

async function addRectLayerFromDraft(draft) {
  if (!state.layerMode || state.templateMode) return;
  pushLayerHistory();
  const scale = displayScaleForCurrentPreview();
  const minX = Math.min(draft.startX, draft.endX);
  const minY = Math.min(draft.startY, draft.endY);
  const width = Math.max(8, Math.abs(draft.endX - draft.startX));
  const height = Math.max(8, Math.abs(draft.endY - draft.startY));
  state.rectangleCounter += 1;
  const item = defaultPromptState({
    type: "rect",
    path: `graphic:rect:${Date.now()}`,
    name: `矩形${state.rectangleCounter}`,
    width: Math.max(1, Math.round(width / scale)),
    height: Math.max(1, Math.round(height / scale)),
    format: "PNG",
    color_mode: "image/png",
    rectLayer: {
      fill: normalizePaint(null, "#FFFFFF"),
      stroke: normalizePaint(null, "#FFFFFF"),
      strokeWidth: 0,
      strokeAlign: DEFAULT_STROKE_ALIGN,
      radius: 0,
      blur: 0
    },
    layerTransform: { x: Math.round(minX / scale), y: Math.round(minY / scale), scale: 1, scaleX: 1, scaleY: 1 },
    layerInitialized: true,
    graphicPropertiesExpanded: true
  });
  item.promptStatus = "done";
  item.riskStatus = "done";
  item.riskMatches = [];
  item.loadStatus = "ready";
  collapseGraphicPanels(item.id);
  state.items.splice(layerInsertIndexForGraphic(), 0, item);
  state.selectedIds = new Set([item.id]);
  await saveGraphicItemImage(item);
  if (!appendLayerItemElement(item)) renderAll();
  else renderSideOnly();
}

function handleToolPointerDown(event) {
  if (!state.layerMode || state.templateMode || event.button !== 0) return;
  if (event.metaKey) return;
  if (event.target.closest("button, input, textarea, select, .side-panel, .zoom-controls")) return;
  if (state.activeTool === "move") {
    if (event.target.closest(".layer-item")) return;
    const stage = refs.previewCanvas.querySelector(".layer-stage");
    if (!stage || !event.target.closest(".layer-stage")) return;
    event.preventDefault();
    const point = previewPoint(event);
    state.selectionDraft = { startX: point.x, startY: point.y, endX: point.x, endY: point.y };
    lockDraftScroll();
    refs.previewWrap.setPointerCapture?.(event.pointerId);
    if (!ensureLiveDraftBox()) renderPreviewNow();
    return;
  }
  if (state.activeTool === "text") {
    event.preventDefault();
    const point = previewPoint(event);
    state.shapeDraft = { tool: "text", startX: point.x, startY: point.y, endX: point.x, endY: point.y };
    lockDraftScroll();
    refs.previewWrap.setPointerCapture?.(event.pointerId);
    if (!ensureLiveDraftBox()) renderPreviewNow();
    return;
  }
  if (state.activeTool === "rect") {
    event.preventDefault();
    const point = previewPoint(event);
    state.shapeDraft = { tool: "rect", startX: point.x, startY: point.y, endX: point.x, endY: point.y };
    lockDraftScroll();
    refs.previewWrap.setPointerCapture?.(event.pointerId);
    if (!ensureLiveDraftBox()) renderPreviewNow();
  }
}

function updateDraftBoxElement(element, draft, showLabel = false) {
  const left = Math.min(draft.startX, draft.endX);
  const top = Math.min(draft.startY, draft.endY);
  const width = Math.abs(draft.endX - draft.startX);
  const height = Math.abs(draft.endY - draft.startY);
  element.style.left = `${left}px`;
  element.style.top = `${top}px`;
  element.style.width = `${Math.max(1, width)}px`;
  element.style.height = `${Math.max(1, height)}px`;
  if (showLabel) {
    const label = element.querySelector(".shape-draft-label");
    if (label) label.textContent = `${Math.round(width)} × ${Math.round(height)}`;
  }
}

function updateLiveDraftBox() {
  const stage = refs.previewCanvas.querySelector(".layer-stage");
  if (!stage) return false;
  if (state.shapeDraft) {
    const element = stage.querySelector(".shape-draft-box:not(.selection-draft-box)");
    if (!element) return false;
    updateDraftBoxElement(element, state.shapeDraft, true);
    return true;
  }
  if (state.selectionDraft) {
    const element = stage.querySelector(".selection-draft-box");
    if (!element) return false;
    updateDraftBoxElement(element, state.selectionDraft);
    return true;
  }
  return false;
}

function ensureLiveDraftBox() {
  const stage = refs.previewCanvas.querySelector(".layer-stage");
  if (!stage) return false;
  if (state.shapeDraft) {
    let element = stage.querySelector(".shape-draft-box:not(.selection-draft-box)");
    if (!element) {
      element = document.createElement("div");
      element.className = "shape-draft-box";
      const label = document.createElement("span");
      label.className = "shape-draft-label";
      element.appendChild(label);
      stage.appendChild(element);
    }
    updateDraftBoxElement(element, state.shapeDraft, true);
    return true;
  }
  if (state.selectionDraft) {
    let element = stage.querySelector(".selection-draft-box");
    if (!element) {
      element = document.createElement("div");
      element.className = "shape-draft-box selection-draft-box";
      stage.appendChild(element);
    }
    updateDraftBoxElement(element, state.selectionDraft);
    return true;
  }
  return false;
}

function removeLiveDraftBoxes() {
  refs.previewCanvas.querySelectorAll(".shape-draft-box").forEach(element => element.remove());
}

function handleToolPointerMove(event) {
  if (!state.shapeDraft && !state.selectionDraft) return;
  restoreDraftScroll();
  event.preventDefault();
  const point = previewPoint(event);
  const draft = state.shapeDraft || state.selectionDraft;
  draft.endX = point.x;
  draft.endY = point.y;
  if (!updateLiveDraftBox()) renderPreviewNow();
}

function handleToolPointerUp(event) {
  if (!state.shapeDraft && !state.selectionDraft) return;
  if (state.selectionDraft) {
    const draft = state.selectionDraft;
    state.selectionDraft = null;
    unlockDraftScroll();
    refs.previewWrap.releasePointerCapture?.(event.pointerId);
    const width = Math.abs(draft.endX - draft.startX);
    const height = Math.abs(draft.endY - draft.startY);
    if (width >= SORT_DRAG_THRESHOLD || height >= SORT_DRAG_THRESHOLD) {
      const left = Math.min(draft.startX, draft.endX);
      const top = Math.min(draft.startY, draft.endY);
      const right = Math.max(draft.startX, draft.endX);
      const bottom = Math.max(draft.startY, draft.endY);
      const scale = displayScaleForCurrentPreview();
      const selected = state.items.filter(item => {
        const transform = layerTransformFor(item);
        const itemLeft = transform.x * scale;
        const itemTop = transform.y * scale;
        const itemRight = itemLeft + item.width * (transform.scaleX || transform.scale) * scale;
        const itemBottom = itemTop + item.height * (transform.scaleY || transform.scale) * scale;
        return itemRight >= left && itemLeft <= right && itemBottom >= top && itemTop <= bottom;
      });
      state.selectedIds = new Set(selected.map(item => item.id));
      state.suppressNextPreviewClear = true;
      syncLayerPanelsForSelection();
      removeLiveDraftBoxes();
      if (!updateLayerStageSelection()) renderAll();
      else {
        updateListSelectionClasses();
        scheduleLayerSideSync(selected[0]?.id);
      }
      requestAnimationFrame(() => scrollListToImage(selected[0]?.id));
    } else {
      removeLiveDraftBoxes();
    }
    return;
  }
  const draft = state.shapeDraft;
  state.shapeDraft = null;
  unlockDraftScroll();
  refs.previewWrap.releasePointerCapture?.(event.pointerId);
  removeLiveDraftBoxes();
  if (draft.tool === "text") {
    addTextLayerFromDraft(draft);
  } else if (draft.tool === "rect") {
    if (Math.abs(draft.endX - draft.startX) >= 8 && Math.abs(draft.endY - draft.startY) >= 8) {
      addRectLayerFromDraft(draft);
    }
  }
}

function handlePreviewBlankClick(event) {
  if (!state.layerMode || state.templateMode || state.activeTool !== "move") return;
  if (state.suppressNextPreviewClear) {
    state.suppressNextPreviewClear = false;
    return;
  }
  if (!state.selectedIds.size) return;
  if (event.target.closest("button, input, textarea, select, .side-panel, .zoom-controls, .layer-stage")) return;
  state.selectedIds.clear();
  syncLayerPanelsForSelection();
  if (!updateLayerStageSelection()) renderAll();
  else {
    updateListSelectionClasses();
    scheduleLayerSideSync();
  }
}

function loadImageElement(item) {
  if (state.previewImageCache.has(item.url)) {
    return state.previewImageCache.get(item.url);
  }
  const promise = new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = error => {
      state.previewImageCache.delete(item.url);
      reject(error);
    };
    image.src = item.url;
  });
  state.previewImageCache.set(item.url, promise);
  return promise;
}

function biggestLayerItem() {
  return state.items.reduce((best, item) => {
    if (!best) return item;
    return item.width * item.height > best.width * best.height ? item : best;
  }, null);
}

function ensureLayerBounds(reset = false) {
  if (!state.items.length) {
    state.layerBounds = { width: 0, height: 0 };
    return state.layerBounds;
  }
  if (reset || !state.layerBounds.width || !state.layerBounds.height) {
    const biggest = biggestLayerItem();
    state.layerBounds = {
      width: Math.max(1, biggest?.width || state.exportWidth || 790),
      height: Math.max(1, biggest?.height || state.exportWidth || 790)
    };
  }
  for (const item of state.items) {
    const transform = layerTransformFor(item);
    if (!item.layerInitialized || reset) {
      transform.scale = 1;
      transform.scaleX = 1;
      transform.scaleY = 1;
      transform.x = Math.round((state.layerBounds.width - item.width) / 2);
      transform.y = Math.round((state.layerBounds.height - item.height) / 2);
      item.layerInitialized = true;
    }
    item.layerTransform = transform;
  }
  return state.layerBounds;
}

function clampSidePaddingForWidth(padding, width) {
  if (!padding.enabled || padding.value <= 0) return 0;
  return Math.max(0, Math.min(Math.round(padding.value), Math.floor((width - 1) / 2)));
}

function scaledEdgeValue(value, width) {
  return Math.round((Number(value) || 0) * (width / state.exportWidth));
}

function rowPaddingMetrics(item, width) {
  const padding = sidePaddingFor(item);
  const enabled = Boolean(padding.enabled);
  const horizontal = enabled ? scaledEdgeValue(padding.value, width) : 0;
  const side = horizontal > 0 ? Math.min(horizontal, Math.floor((width - 1) / 2)) : 0;
  const sideCrop = horizontal < 0 ? Math.min(Math.abs(horizontal), Math.max(0, width * 2)) : 0;
  const imageDrawWidth = Math.max(1, horizontal < 0 ? width + sideCrop * 2 : width - side * 2);
  const imageDrawHeight = Math.max(1, Math.round((item.height * imageDrawWidth) / item.width));
  const top = enabled ? scaledEdgeValue(padding.topValue, width) : 0;
  const bottom = enabled ? scaledEdgeValue(padding.bottomValue, width) : 0;
  const topPad = Math.max(0, top);
  const bottomPad = Math.max(0, bottom);
  const topCrop = Math.min(Math.max(0, -top), imageDrawHeight - 1);
  const bottomCrop = Math.min(Math.max(0, -bottom), imageDrawHeight - topCrop - 1);
  const visibleHeight = Math.max(1, imageDrawHeight - topCrop - bottomCrop);
  const rowHeight = topPad + visibleHeight + bottomPad;
  return { padding, side, sideCrop, imageDrawWidth, imageDrawHeight, topPad, bottomPad, topCrop, visibleHeight, rowHeight };
}

function drawSidePadding(context, image, side, x, y, width, height, mode, color) {
  if (width <= 0 || height <= 0) return;
  const effectiveMode = mode === "microShadow" ? "edge" : mode;
  context.save();
  context.beginPath();
  context.rect(x, y, width, height);
  context.clip();
  context.fillStyle = color || state.spacingColor || DEFAULT_COLOR;
  context.fillRect(x, y, width, height);

  const sample = Math.max(1, Math.min(48, Math.round(image.naturalWidth * 0.08)));
  if (effectiveMode === "edge") {
    const sx = side === "left" ? 0 : image.naturalWidth - 1;
    context.drawImage(image, sx, 0, 1, image.naturalHeight, x, y, width, height);
  } else if (effectiveMode === "mirror") {
    if (side === "left") {
      context.scale(-1, 1);
      context.drawImage(image, 0, 0, sample, image.naturalHeight, -x - width, y, width, height);
    } else {
      context.scale(-1, 1);
      context.drawImage(image, image.naturalWidth - sample, 0, sample, image.naturalHeight, -x - width, y, width, height);
    }
  } else if (effectiveMode === "blur") {
    context.filter = "blur(8px)";
    const sx = side === "left" ? 0 : image.naturalWidth - sample;
    context.drawImage(image, sx, 0, sample, image.naturalHeight, x - 10, y - 10, width + 20, height + 20);
  } else if (effectiveMode === "gradient") {
    const sx = side === "left" ? 0 : image.naturalWidth - Math.max(1, sample);
    context.drawImage(image, sx, 0, Math.max(1, sample), image.naturalHeight, x, y, width, height);
    const gradient = context.createLinearGradient(x, 0, x + width, 0);
    if (side === "left") {
      gradient.addColorStop(0, color || state.spacingColor || DEFAULT_COLOR);
      gradient.addColorStop(1, "rgba(255,255,255,0)");
    } else {
      gradient.addColorStop(0, "rgba(255,255,255,0)");
      gradient.addColorStop(1, color || state.spacingColor || DEFAULT_COLOR);
    }
    context.fillStyle = gradient;
    context.fillRect(x, y, width, height);
  }
  context.restore();
}

function drawMicroShadowVerticalPadding(context, sourceCanvas, side, x, y, width, height, percent) {
  const sampleY = side === "top" ? 0 : sourceCanvas.height - 1;
  const edgeData = sourceCanvas.getContext("2d").getImageData(0, sampleY, sourceCanvas.width, 1).data;
  const imageData = context.createImageData(width, height);
  const amount = microShadowAmountFromPercent(percent);
  const widthRatio = sourceCanvas.width / width;
  for (let py = 0; py < height; py += 1) {
    const progress = height <= 1 ? 1 : py / (height - 1);
    const t = smoothStep(progress);
    for (let px = 0; px < width; px += 1) {
      const sourceX = Math.min(sourceCanvas.width - 1, Math.floor(px * widthRatio));
      const sourceOffset = sourceX * 4;
      const base = [edgeData[sourceOffset], edgeData[sourceOffset + 1], edgeData[sourceOffset + 2]];
      const shifted = side === "top" ? darkenRgb(base, amount) : lightenRgb(base, amount);
      const mixed = side === "top"
        ? blendRgbChannels(shifted, base, t)
        : blendRgbChannels(base, shifted, t);
      const offset = (py * width + px) * 4;
      imageData.data[offset] = mixed[0];
      imageData.data[offset + 1] = mixed[1];
      imageData.data[offset + 2] = mixed[2];
      imageData.data[offset + 3] = 255;
    }
  }
  context.putImageData(imageData, x, y);
}

function fillMicroShadowGap(context, previousData, nextData, width, height, percent) {
  const output = context.createImageData(width, height);
  const amount = microShadowAmountFromPercent(percent);
  const upper = Math.max(1, Math.ceil(height / 2));
  const lower = Math.max(1, height - upper);
  for (let y = 0; y < height; y += 1) {
    const inUpper = y < upper;
    const local = inUpper
      ? (upper <= 1 ? 1 : y / (upper - 1))
      : (lower <= 1 ? 0 : (y - upper) / (lower - 1));
    const t = smoothStep(local);
    for (let x = 0; x < width; x += 1) {
      const source = x * 4;
      const base = inUpper
        ? [previousData[source], previousData[source + 1], previousData[source + 2]]
        : [nextData[source], nextData[source + 1], nextData[source + 2]];
      const shifted = inUpper ? lightenRgb(base, amount) : darkenRgb(base, amount);
      const mixed = inUpper
        ? blendRgbChannels(base, shifted, t)
        : blendRgbChannels(shifted, base, t);
      const target = (y * width + x) * 4;
      output.data[target] = mixed[0];
      output.data[target + 1] = mixed[1];
      output.data[target + 2] = mixed[2];
      output.data[target + 3] = 255;
    }
  }
  context.putImageData(output, 0, 0);
}

function drawVerticalPadding(context, sourceCanvas, side, x, y, width, height, mode, color, microShadowPercent = DEFAULT_MICRO_SHADOW_PERCENT) {
  if (width <= 0 || height <= 0 || !sourceCanvas.width || !sourceCanvas.height) return;
  context.save();
  context.beginPath();
  context.rect(x, y, width, height);
  context.clip();
  context.fillStyle = color || state.spacingColor || DEFAULT_COLOR;
  context.fillRect(x, y, width, height);

  const sample = Math.max(1, Math.min(48, Math.round(sourceCanvas.height * 0.08)));
  if (mode === "microShadow") {
    drawMicroShadowVerticalPadding(context, sourceCanvas, side, x, y, width, height, microShadowPercent);
  } else if (mode === "edge") {
    const sy = side === "top" ? 0 : sourceCanvas.height - 1;
    context.drawImage(sourceCanvas, 0, sy, sourceCanvas.width, 1, x, y, width, height);
  } else if (mode === "mirror") {
    if (side === "top") {
      context.scale(1, -1);
      context.drawImage(sourceCanvas, 0, 0, sourceCanvas.width, sample, x, -y - height, width, height);
    } else {
      context.scale(1, -1);
      context.drawImage(sourceCanvas, 0, sourceCanvas.height - sample, sourceCanvas.width, sample, x, -y - height, width, height);
    }
  } else if (mode === "blur") {
    context.filter = "blur(8px)";
    const sy = side === "top" ? 0 : sourceCanvas.height - sample;
    context.drawImage(sourceCanvas, 0, sy, sourceCanvas.width, sample, x - 10, y - 10, width + 20, height + 20);
  } else if (mode === "gradient") {
    const sy = side === "top" ? 0 : sourceCanvas.height - sample;
    context.drawImage(sourceCanvas, 0, sy, sourceCanvas.width, sample, x, y, width, height);
    const gradient = context.createLinearGradient(0, y, 0, y + height);
    if (side === "top") {
      gradient.addColorStop(0, color || state.spacingColor || DEFAULT_COLOR);
      gradient.addColorStop(1, "rgba(255,255,255,0)");
    } else {
      gradient.addColorStop(0, "rgba(255,255,255,0)");
      gradient.addColorStop(1, color || state.spacingColor || DEFAULT_COLOR);
    }
    context.fillStyle = gradient;
    context.fillRect(x, y, width, height);
  }
  context.restore();
}

async function drawPreviewRow(canvas, item, width) {
  const context = canvas.getContext("2d");
  if (!context) return;
  const metrics = rowPaddingMetrics(item, width);
  const { padding, side, sideCrop, imageDrawWidth, imageDrawHeight, topPad, bottomPad, topCrop, visibleHeight, rowHeight } = metrics;
  canvas.width = width;
  canvas.height = rowHeight;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${rowHeight}px`;
  context.fillStyle = state.backgroundColor || DEFAULT_COLOR;
  context.fillRect(0, 0, width, rowHeight);
  try {
    const image = await loadImageElement(item);
    const fullContentCanvas = document.createElement("canvas");
    fullContentCanvas.width = width;
    fullContentCanvas.height = imageDrawHeight;
    const fullContentContext = fullContentCanvas.getContext("2d");
    fullContentContext.fillStyle = state.backgroundColor || DEFAULT_COLOR;
    fullContentContext.fillRect(0, 0, width, imageDrawHeight);
    if (side > 0) {
      drawSidePadding(fullContentContext, image, "left", 0, 0, side, imageDrawHeight, padding.mode, padding.color);
      drawSidePadding(fullContentContext, image, "right", width - side, 0, side, imageDrawHeight, padding.mode, padding.color);
    }
    fullContentContext.drawImage(image, side > 0 ? side : -sideCrop, 0, imageDrawWidth, imageDrawHeight);

    const contentCanvas = document.createElement("canvas");
    contentCanvas.width = width;
    contentCanvas.height = visibleHeight;
    const contentContext = contentCanvas.getContext("2d");
    contentContext.drawImage(fullContentCanvas, 0, topCrop, width, visibleHeight, 0, 0, width, visibleHeight);
    drawVerticalPadding(context, contentCanvas, "top", 0, 0, width, topPad, padding.mode, padding.color, padding.microShadowPercent);
    context.drawImage(contentCanvas, 0, topPad);
    drawVerticalPadding(context, contentCanvas, "bottom", 0, topPad + visibleHeight, width, bottomPad, padding.mode, padding.color, padding.microShadowPercent);
  } catch {
    item.loadStatus = "failed";
    item.loadError = "图片加载失败，请重新添加";
    renderSideOnly();
  }
}

function renderPreview() {
  if (state.ledgerMode) {
    showPreviewPage();
    return;
  }
  const keepTop = refs.previewWrap.scrollTop;
  const keepLeft = refs.previewWrap.scrollLeft;
  refs.previewCanvas.innerHTML = "";
  refs.previewCanvas.classList.remove("template-mode");
  refs.previewCanvas.classList.remove("layer-mode");

  if (!state.items.length) {
    showDropPage();
    return;
  }

  showPreviewPage();
  const fitWidth = Math.max(280, refs.previewWrap.clientWidth - 48);
  const displayWidth = Math.round(fitWidth * state.previewZoom);
  refs.previewCanvas.style.alignItems = state.previewZoom <= 1 ? "center" : "flex-start";
  refs.previewCanvas.style.background = state.backgroundColor;

  if (state.templateMode) {
    renderTemplatePreview(displayWidth);
    requestAnimationFrame(() => {
      refs.previewWrap.scrollTop = keepTop;
      refs.previewWrap.scrollLeft = keepLeft;
    });
    return;
  }

  if (state.layerMode) {
    renderLayerPreview();
    requestAnimationFrame(() => {
      refs.previewWrap.scrollTop = state.draftScrollLock?.top ?? keepTop;
      refs.previewWrap.scrollLeft = state.draftScrollLock?.left ?? keepLeft;
    });
    return;
  }

  for (const [index, item] of state.items.entries()) {
    const rowHeight = rowPaddingMetrics(item, displayWidth).rowHeight;
    const frame = document.createElement("div");
    frame.className = "preview-frame";
    frame.dataset.id = item.id;
    frame.style.width = `${displayWidth}px`;
    frame.style.minHeight = `${rowHeight}px`;
    if (state.sortState.active && state.sortState.sourceId === item.id) {
      frame.classList.add("sort-source");
    }
    if (state.sortState.active && state.sortState.targetId === item.id) {
      frame.classList.add(state.sortState.placement === "before" ? "sort-before" : "sort-after");
    }
    frame.addEventListener("pointerdown", event => {
      if (event.button !== 0) return;
      startSort(item.id, event, {
        targetSelector: ".preview-frame",
        scrollElement: refs.previewWrap
      });
    });
    frame.addEventListener("click", () => selectImageFromPreview(item.id));

    if (item.loadStatus === "failed") {
      const failed = document.createElement("div");
      failed.className = "preview-failed";
      failed.textContent = "图片加载失败，请重新添加";
      frame.appendChild(failed);
      refs.previewCanvas.appendChild(frame);
    } else {
    const image = document.createElement("canvas");
    image.className = "preview-image preview-row-canvas";
    image.width = displayWidth;
    image.height = rowHeight;
    image.style.width = `${displayWidth}px`;
    image.style.height = `${rowHeight}px`;
    drawPreviewRow(image, item, displayWidth).then(() => {
      if (item.loadStatus !== "ready") {
        item.loadStatus = "ready";
        renderList();
      }
    });
    if (false) {
      image.addEventListener("error", () => {
        console.error("图片加载失败", item.path);
        item.loadStatus = "failed";
        item.loadError = "图片加载失败，请重新添加";
        renderAll();
      }, { once: true });
      image.addEventListener("load", () => {
        if (item.loadStatus !== "ready") {
          item.loadStatus = "ready";
          renderList();
        }
      }, { once: true });
      }
      frame.appendChild(image);
      refs.previewCanvas.appendChild(frame);
    }

    if (index < state.items.length - 1 && state.spacing > 0) {
      refs.previewCanvas.appendChild(createPreviewGap(item, state.items[index + 1], displayWidth));
    }
  }

  requestAnimationFrame(() => {
    refs.previewWrap.scrollTop = keepTop;
    refs.previewWrap.scrollLeft = keepLeft;
  });
}

function renderLayerPreview() {
  const bounds = ensureLayerBounds(false);
  refs.previewCanvas.classList.add("layer-mode");
  refs.previewCanvas.style.alignItems = state.previewZoom <= 1 ? "center" : "flex-start";
  refs.previewCanvas.style.background = state.backgroundColor;
  const fitWidth = Math.max(280, refs.previewWrap.clientWidth - 72);
  const fitHeight = Math.max(220, refs.previewWrap.clientHeight - 92);
  const baseScale = Math.min(fitWidth / bounds.width, fitHeight / bounds.height, 1);
  const displayScale = Math.max(0.02, baseScale * state.previewZoom);
  const stageWidth = Math.max(1, Math.round(bounds.width * displayScale));
  const stageHeight = Math.max(1, Math.round(bounds.height * displayScale));

  const stage = document.createElement("div");
  stage.className = "layer-stage";
  stage.style.width = `${stageWidth}px`;
  stage.style.height = `${stageHeight}px`;
  stage.style.background = state.backgroundColor || DEFAULT_COLOR;
  stage.dataset.scale = String(displayScale);

  for (const item of state.items) {
    const transform = layerTransformFor(item);
    const selected = state.selectedIds.has(item.id);
    const layer = document.createElement("div");
    layer.className = `layer-item${selected ? " selected" : ""}`;
    layer.dataset.id = item.id;
    layer.style.left = `${transform.x * displayScale}px`;
    layer.style.top = `${transform.y * displayScale}px`;
    layer.style.width = `${item.width * (transform.scaleX || transform.scale) * displayScale}px`;
    layer.style.height = `${item.height * (transform.scaleY || transform.scale) * displayScale}px`;
    layer.style.mixBlendMode = layerBlendCss(layerBlendModeFor(item));
    layer.addEventListener("pointerdown", event => startLayerMove(item.id, event, displayScale));
    layer.addEventListener("dblclick", event => {
      if (item.type !== "text" || state.activeTool !== "move") return;
      event.preventDefault();
      event.stopPropagation();
      startInlineTextEdit(item.id, layer);
    });
    layer.addEventListener("click", event => handleLayerElementClick(item, layer, event));

    if (item.type === "text") {
      const textLayer = item.textLayer || {};
      const textPreview = document.createElement("div");
      textPreview.className = `layer-text-preview${textLayer.boxFit ? " box-fit" : ""}`;
      textPreview.textContent = textLayer.text || TEXT_LAYER_DEFAULT_TEXT;
      textPreview.style.font = textLayer.boxFit
        ? fontCssWithSize(textLayer, fittedBoxTextSize(item), displayScale)
        : fontCss(textLayer, displayScale);
      textPreview.style.lineHeight = "1";
      textPreview.style.color = rgbaFromPaint(textLayer.fill, "#000000");
      textPreview.style.textAlign = textLayer.align || "left";
      if (textLayer.boxFit) {
        textPreview.style.justifyContent = textLayer.align === "left" ? "flex-start" : textLayer.align === "right" ? "flex-end" : "center";
      }
      applyTextPreviewStroke(textPreview, textLayer, displayScale);
      if (textLayer.fill?.mode === "gradient") {
        textPreview.style.backgroundImage = paintSwatchBackground(textLayer.fill);
        textPreview.style.backgroundClip = "text";
        textPreview.style.webkitBackgroundClip = "text";
        textPreview.style.color = "transparent";
      }
      layer.appendChild(textPreview);
    } else if (item.type === "rect") {
      const rectLayer = item.rectLayer || {};
      const preview = state.layerReplacementPreview.get(item.id);
      if (preview?.url) {
        const rectImage = document.createElement("img");
        rectImage.className = "layer-rect-preview";
        rectImage.src = preview.url;
        rectImage.alt = item.name;
        rectImage.draggable = false;
        layer.appendChild(rectImage);
      } else {
        const rectPreview = document.createElement("div");
        rectPreview.className = "layer-rect-preview";
        applyRectPreviewStyle(rectPreview, rectLayer, displayScale);
        layer.appendChild(rectPreview);
      }
    } else {
      const preview = state.layerReplacementPreview.get(item.id);
      const image = document.createElement("img");
      image.src = preview?.url || item.url;
      image.alt = item.name;
      image.draggable = false;
      layer.appendChild(image);
    }

    if (selected) attachLayerResizeHandles(layer, item, displayScale);
    stage.appendChild(layer);
  }
  const updateDraftElement = (element, draft, showLabel = false) => {
    const left = Math.min(draft.startX, draft.endX);
    const top = Math.min(draft.startY, draft.endY);
    const width = Math.abs(draft.endX - draft.startX);
    const height = Math.abs(draft.endY - draft.startY);
    element.style.left = `${left}px`;
    element.style.top = `${top}px`;
    element.style.width = `${Math.max(1, width)}px`;
    element.style.height = `${Math.max(1, height)}px`;
    if (showLabel) {
      const label = element.querySelector(".shape-draft-label");
      if (label) label.textContent = `${Math.round(width)} × ${Math.round(height)}`;
    }
  };
  if (state.shapeDraft && ["text", "rect"].includes(state.shapeDraft.tool || state.activeTool)) {
    const draft = state.shapeDraft;
    const draftBox = document.createElement("div");
    draftBox.className = `shape-draft-box ${draft.tool || state.activeTool}`;
    if (draft.tool === "rect") {
      draftBox.classList.add("rect-preview");
    }
    const label = document.createElement("span");
    label.className = "shape-draft-label";
    draftBox.appendChild(label);
    updateDraftElement(draftBox, draft, true);
    stage.appendChild(draftBox);
  }
  if (state.selectionDraft) {
    const draft = state.selectionDraft;
    const selectBox = document.createElement("div");
    selectBox.className = "shape-draft-box selection-draft-box";
    updateDraftElement(selectBox, draft);
    stage.appendChild(selectBox);
  }
  renderSnapGuides(stage, displayScale);
  stage.addEventListener("click", () => {
    if (state.suppressNextPreviewClear) {
      state.suppressNextPreviewClear = false;
      return;
    }
    if (state.activeTool !== "move") return;
    state.selectedIds.clear();
    syncLayerPanelsForSelection();
    if (!updateLayerStageSelection()) renderAll();
    else {
      updateListSelectionClasses();
      scheduleLayerSideSync();
    }
  });
  refs.previewCanvas.appendChild(stage);
}

function createPreviewGap(previousItem, nextItem, width) {
  const gapHeight = Math.max(1, Math.round(state.spacing * state.previewZoom));
  const mode = state.spacingFillMode || DEFAULT_SPACING_FILL_MODE;
  if (mode === "solid" || !previousItem?.url || !nextItem?.url) {
    const gap = document.createElement("div");
    gap.className = "spacing-block";
    gap.style.width = `${width}px`;
    gap.style.height = `${gapHeight}px`;
    gap.style.background = state.spacingColor;
    return gap;
  }

  const canvas = document.createElement("canvas");
  canvas.className = "spacing-block";
  canvas.width = width;
  canvas.height = gapHeight;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${gapHeight}px`;
  canvas.style.background = state.spacingColor;
  drawPreviewGap(canvas, previousItem, nextItem, mode, state.spacingMicroShadowPercent);
  return canvas;
}

function drawPreviewGap(canvas, previousItem, nextItem, mode, microShadowPercent = DEFAULT_MICRO_SHADOW_PERCENT) {
  const previousImage = new Image();
  const nextImage = new Image();
  let loaded = 0;
  const draw = () => {
    loaded += 1;
    if (loaded < 2) return;
    const context = canvas.getContext("2d");
    const width = canvas.width;
    const height = canvas.height;
    if (!context || !width || !height) return;

    const previousHeight = Math.max(1, Math.round((previousItem.height * width) / previousItem.width));
    const nextHeight = Math.max(1, Math.round((nextItem.height * width) / nextItem.width));
    const previousCanvas = document.createElement("canvas");
    const nextCanvas = document.createElement("canvas");
    previousCanvas.width = width;
    previousCanvas.height = previousHeight;
    nextCanvas.width = width;
    nextCanvas.height = nextHeight;
    const previousContext = previousCanvas.getContext("2d");
    const nextContext = nextCanvas.getContext("2d");
    previousContext.fillStyle = state.backgroundColor || DEFAULT_COLOR;
    nextContext.fillStyle = state.backgroundColor || DEFAULT_COLOR;
    previousContext.fillRect(0, 0, width, previousHeight);
    nextContext.fillRect(0, 0, width, nextHeight);
    previousContext.drawImage(previousImage, 0, 0, width, previousHeight);
    nextContext.drawImage(nextImage, 0, 0, width, nextHeight);

    if (mode === "extend") {
      const upper = Math.ceil(height / 2);
      context.drawImage(previousCanvas, 0, previousHeight - 1, width, 1, 0, 0, width, upper);
      context.drawImage(nextCanvas, 0, 0, width, 1, 0, upper, width, height - upper);
      return;
    }

    if (mode === "mirror") {
      const upper = Math.ceil(height / 2);
      const sample = Math.min(previousHeight, Math.max(1, upper));
      const lowerSample = Math.min(nextHeight, Math.max(1, height - upper));
      context.save();
      context.scale(1, -1);
      context.drawImage(previousCanvas, 0, previousHeight - sample, width, sample, 0, -upper, width, upper);
      context.restore();
      context.save();
      context.translate(0, upper);
      context.scale(1, -1);
      context.drawImage(nextCanvas, 0, 0, width, lowerSample, 0, -(height - upper), width, height - upper);
      context.restore();
      return;
    }

    const previousData = previousContext.getImageData(0, previousHeight - 1, width, 1).data;
    const nextData = nextContext.getImageData(0, 0, width, 1).data;
    if (mode === "microShadow") {
      fillMicroShadowGap(context, previousData, nextData, width, height, microShadowPercent);
      return;
    }

    const output = context.createImageData(width, height);
    for (let y = 0; y < height; y += 1) {
      const t = height <= 1 ? 0.5 : y / (height - 1);
      for (let x = 0; x < width; x += 1) {
        const source = x * 4;
        const target = (y * width + x) * 4;
        output.data[target] = Math.round(previousData[source] * (1 - t) + nextData[source] * t);
        output.data[target + 1] = Math.round(previousData[source + 1] * (1 - t) + nextData[source + 1] * t);
        output.data[target + 2] = Math.round(previousData[source + 2] * (1 - t) + nextData[source + 2] * t);
        output.data[target + 3] = 255;
      }
    }
    context.putImageData(output, 0, 0);
  };
  previousImage.onload = draw;
  nextImage.onload = draw;
  previousImage.src = previousItem.url;
  nextImage.src = nextItem.url;
}

function renderTemplatePreview(_displayWidth) {
  const available = Math.max(620, refs.previewWrap.clientWidth - 72);
  const columnWidth = Math.round((available - 18) / 2 * state.previewZoom);
  refs.previewCanvas.style.alignItems = state.previewZoom <= 1 ? "stretch" : "flex-start";
  refs.previewCanvas.classList.add("template-mode");

  const shell = document.createElement("div");
  shell.className = "template-columns";
  shell.style.width = `${columnWidth * 2 + 18}px`;

  const leftTitle = document.createElement("div");
  leftTitle.className = "template-column-title";
  const leftTitleText = document.createElement("span");
  leftTitleText.textContent = "套版结果";
  const templateHint = document.createElement("span");
  templateHint.className = "template-result-hint";
  templateHint.textContent = "该套版效果取决于提示词和生图API模型的能力！";
  leftTitle.append(leftTitleText, templateHint);
  const rightTitle = document.createElement("div");
  rightTitle.className = "template-column-title";
  rightTitle.textContent = "原图参考";
  shell.append(leftTitle, rightTitle);

  for (const item of state.items) {
    shell.append(
      createTemplateResultFrame(item, columnWidth),
      createTemplateReferenceFrame(item, columnWidth)
    );
  }
  refs.previewCanvas.appendChild(shell);
}

function createTemplateReferenceFrame(item, width) {
  const frame = document.createElement("div");
  const height = Math.round((item.height * width) / item.width);
  frame.className = "template-screen template-reference";
  frame.dataset.id = item.id;
  frame.style.width = `${width}px`;
  frame.addEventListener("click", () => selectImageFromPreview(item.id));
  const image = document.createElement("img");
  image.className = "preview-image";
  image.src = item.url;
  image.alt = item.name;
  image.style.width = `${width}px`;
  image.style.height = `${height}px`;
  frame.appendChild(image);
  return frame;
}

function createTemplateResultFrame(item, width) {
  const frame = document.createElement("div");
  const resultUrl = item.templateUrl || item.url;
  const baseWidth = item.templateCopiedOriginal || !item.templateUrl ? item.width : (item.templateWidth || item.width);
  const baseHeight = item.templateCopiedOriginal || !item.templateUrl ? item.height : (item.templateHeight || item.height);
  const height = Math.round((baseHeight * width) / baseWidth);
  frame.className = `template-screen template-result ${item.templateStatus}`;
  frame.dataset.id = item.id;
  frame.style.width = `${width}px`;
  frame.style.minHeight = `${Math.max(160, height)}px`;
  frame.addEventListener("click", () => selectImageFromPreview(item.id));

  if (["done", "copied"].includes(item.templateStatus) && resultUrl) {
    const image = document.createElement("img");
    image.className = "preview-image";
    image.src = resultUrl;
    image.alt = item.name;
    image.style.width = `${width}px`;
    image.style.height = `${height}px`;
    frame.appendChild(image);
    if (item.templateCopiedOriginal) {
      const badge = document.createElement("div");
      badge.className = "template-badge";
      badge.textContent = "直接复制原图";
      frame.appendChild(badge);
    }
  } else {
    const placeholder = document.createElement("div");
    placeholder.className = "template-placeholder";
    placeholder.textContent = item.templateStatus === "generating"
      ? "生成中..."
      : item.templateStatus === "failed"
        ? item.templateError || "生成失败"
        : "等待生成";
    frame.appendChild(placeholder);
  }
  return frame;
}

function promptButtonLabel(item) {
  switch (item.promptStatus) {
    case "queued":
      return "排队";
    case "generating":
      return `生成中 ${item.promptProgress}%`;
    case "done":
      return "提示词";
    case "failed":
      return "重试";
    case "stopped":
      return "继续";
    default:
      return "提示词";
  }
}

function riskButtonLabel(item) {
  switch (item.riskStatus) {
    case "checking":
      return "识别中";
    case "done":
      return item.riskMatches.length ? `风险 ${item.riskMatches.length}` : "无风险";
    case "failed":
      return "重试";
    default:
      return "排查";
  }
}

function alignSelectedLayers(mode) {
  if (!state.layerMode) return;
  const items = selectedItems();
  if (items.length < 2) return;
  pushLayerHistory();
  const rects = items.map(item => ({ item, rect: layerRectForItem(item), transform: layerTransformFor(item) }));
  const left = Math.min(...rects.map(entry => entry.rect.x));
  const right = Math.max(...rects.map(entry => entry.rect.x + entry.rect.width));
  const top = Math.min(...rects.map(entry => entry.rect.y));
  const bottom = Math.max(...rects.map(entry => entry.rect.y + entry.rect.height));
  const centerX = (left + right) / 2;
  const centerY = (top + bottom) / 2;
  if (mode === "distribute-x") {
    const sorted = [...rects].sort((a, b) => a.rect.x - b.rect.x);
    const totalWidth = sorted.reduce((sum, entry) => sum + entry.rect.width, 0);
    const gap = sorted.length > 1 ? (right - left - totalWidth) / (sorted.length - 1) : 0;
    let cursor = left;
    for (const entry of sorted) {
      entry.transform.x = cursor;
      entry.item.layerTransform = entry.transform;
      cursor += entry.rect.width + gap;
    }
    if (!updateSelectedLayerElementPositions()) renderAll();
    else scheduleLayerSideSync(sorted[0]?.item.id);
    return;
  }
  if (mode === "distribute-y") {
    const sorted = [...rects].sort((a, b) => a.rect.y - b.rect.y);
    const totalHeight = sorted.reduce((sum, entry) => sum + entry.rect.height, 0);
    const gap = sorted.length > 1 ? (bottom - top - totalHeight) / (sorted.length - 1) : 0;
    let cursor = top;
    for (const entry of sorted) {
      entry.transform.y = cursor;
      entry.item.layerTransform = entry.transform;
      cursor += entry.rect.height + gap;
    }
    if (!updateSelectedLayerElementPositions()) renderAll();
    else scheduleLayerSideSync(sorted[0]?.item.id);
    return;
  }
  for (const entry of rects) {
    if (mode === "left") entry.transform.x = left;
    if (mode === "right") entry.transform.x = right - entry.rect.width;
    if (mode === "center-x") entry.transform.x = centerX - entry.rect.width / 2;
    if (mode === "top") entry.transform.y = top;
    if (mode === "bottom") entry.transform.y = bottom - entry.rect.height;
    if (mode === "center-y") entry.transform.y = centerY - entry.rect.height / 2;
    entry.item.layerTransform = entry.transform;
  }
  if (!updateSelectedLayerElementPositions()) renderAll();
  else scheduleLayerSideSync(rects[0]?.item.id);
}

function renderLayerAlignBar() {
  refs.layerAlignBar.hidden = !(state.layerMode && state.selectedIds.size > 1);
  refs.layerAlignBar.innerHTML = "";
  if (refs.layerAlignBar.hidden) return;
  for (const option of [
    ["left", "左对齐", "align-left"],
    ["center-x", "水平居中", "align-center"],
    ["right", "右对齐", "align-right"],
    ["top", "顶对齐", "align-top"],
    ["center-y", "垂直居中", "align-middle"],
    ["bottom", "底对齐", "align-bottom"],
    ["distribute-x", "水平分布", "distribute-x"],
    ["distribute-y", "垂直分布", "distribute-y"]
  ]) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `layer-align-button ${option[2]}`;
    button.dataset.alignIcon = option[2];
    button.title = option[1];
    button.setAttribute("aria-label", option[1]);
    for (let i = 0; i < 3; i += 1) {
      const line = document.createElement("span");
      line.className = "align-icon-line";
      button.appendChild(line);
    }
    button.addEventListener("click", () => alignSelectedLayers(option[0]));
    refs.layerAlignBar.appendChild(button);
  }
}

function renderList() {
  refs.imageList.innerHTML = "";
  renderLayerAlignBar();
  const showPromptControls = state.listActionMode === "prompt";
  const showRiskControls = state.listActionMode === "risk";
  const showReplaceControls = state.batchReplaceMode || state.layerMode;

  const visibleItems = state.layerMode ? [...state.items].reverse() : state.items;
  for (const item of visibleItems) {
    if (state.layerMode) {
      const padding = sidePaddingFor(item);
      if (padding.expanded) {
        padding.expanded = false;
        item.sidePadding = padding;
      }
    }
    const row = document.createElement("div");
    row.className = `list-item${state.selectedIds.has(item.id) ? " selected" : ""}`;
    row.dataset.id = item.id;
    row.addEventListener("click", event => handleRowClick(item.id, event));
    row.addEventListener("pointerdown", event => {
      if (event.shiftKey || event.ctrlKey || event.metaKey) return;
      if (event.button !== 0 || isListSortBlockedTarget(event.target)) return;
      startSort(item.id, event, {
        targetSelector: ".list-item",
        scrollElement: refs.imageList
      });
    });

    if (state.sortState.active && state.sortState.sourceId === item.id) {
      row.classList.add("sort-source");
    }
    if (state.sortState.active && state.sortState.targetId === item.id) {
      row.classList.add(state.sortState.placement === "before" ? "sort-before" : "sort-after");
    }

    const header = document.createElement("div");
    header.className = "item-header";

    const handle = document.createElement("button");
    handle.className = "drag-handle";
    handle.type = "button";
    handle.title = "拖动排序";
    if (item.type === "text") {
      const textThumb = document.createElement("span");
      textThumb.className = "drag-thumbnail graphic-thumb text-thumb";
      textThumb.textContent = "T";
      handle.appendChild(textThumb);
    } else {
      const thumbnail = document.createElement("img");
      thumbnail.className = "drag-thumbnail";
      thumbnail.src = item.url;
      thumbnail.alt = item.name;
      thumbnail.draggable = false;
      handle.appendChild(thumbnail);
    }
    handle.addEventListener("pointerdown", event => {
      if (event.shiftKey || event.ctrlKey || event.metaKey) return;
      startSort(item.id, event);
    });
    handle.addEventListener("click", event => {
      event.stopPropagation();
      handleRowClick(item.id, event);
    });

    const name = document.createElement("div");
    name.className = "file-name";
    name.textContent = item.type === "text" ? (item.textLayer?.text || TEXT_LAYER_DEFAULT_TEXT) : item.name;
    name.title = item.path;
    name.addEventListener("click", event => {
      event.stopPropagation();
      handleRowClick(item.id, event);
    });

    const promptButton = document.createElement("button");
    promptButton.type = "button";
    promptButton.className = `status-button prompt-toggle ${item.promptStatus}`;
    promptButton.textContent = promptButtonLabel(item);
    promptButton.hidden = !showPromptControls || showReplaceControls;
    promptButton.addEventListener("click", event => {
      event.stopPropagation();
      handlePromptButton(item.id);
    });

    const riskButton = document.createElement("button");
    riskButton.type = "button";
    const riskClass = item.riskStatus === "done" && item.riskMatches.length ? "risk" : item.riskStatus;
    riskButton.className = `status-button risk-toggle ${riskClass}`;
    riskButton.textContent = riskButtonLabel(item);
    riskButton.hidden = !showRiskControls || showReplaceControls;
    riskButton.addEventListener("click", event => {
      event.stopPropagation();
      handleRiskButton(item.id);
    });

    const paddingButton = document.createElement("button");
    paddingButton.type = "button";
    paddingButton.className = `status-button side-padding-toggle${sidePaddingFor(item).expanded ? " active" : ""}`;
    paddingButton.textContent = isGraphicLayer(item) ? "属性" : "边距";
    paddingButton.hidden = state.layerMode && !isGraphicLayer(item);
    paddingButton.addEventListener("click", event => {
      event.stopPropagation();
      if (isGraphicLayer(item)) toggleGraphicPropertiesPanel(item.id);
      else toggleSidePaddingPanel(item.id);
    });

    const replacementButton = document.createElement("button");
    replacementButton.type = "button";
    replacementButton.className = `status-button replacement-toggle${item.isReplacementExpanded ? " active" : ""}`;
    replacementButton.textContent = replacementButtonLabel(item);
    replacementButton.hidden = !showReplaceControls;
    replacementButton.addEventListener("click", event => {
      event.stopPropagation();
      toggleReplacementPanel(item.id);
    });

    const actions = document.createElement("div");
    actions.className = "item-actions";
    actions.append(promptButton, riskButton, replacementButton, paddingButton);

    header.append(handle, name, actions);
    row.appendChild(header);

    const body = document.createElement("div");
    body.className = `prompt-body${showPromptControls && item.isPromptExpanded ? " show" : ""}`;
    if (showPromptControls && item.isPromptExpanded && item.promptStatus === "done") {
      const editor = document.createElement("textarea");
      editor.className = "prompt-editor";
      editor.value = item.promptText;
      editor.addEventListener("pointerdown", event => event.stopPropagation());
      editor.addEventListener("click", event => event.stopPropagation());
      editor.addEventListener("input", () => {
        item.promptText = editor.value;
      });
      const referenceBlock = createReferenceBlock(item);
      const actions = document.createElement("div");
      actions.className = "prompt-actions";
      const copyBtn = document.createElement("button");
      copyBtn.type = "button";
      copyBtn.className = "button";
      copyBtn.textContent = "复制";
      copyBtn.addEventListener("click", () => copyText(item.promptText).then(() => showToast("已复制当前提示词")));
      const reextractBtn = document.createElement("button");
      reextractBtn.type = "button";
      reextractBtn.className = "button";
      reextractBtn.textContent = "重新提取";
      reextractBtn.addEventListener("click", () => startPromptGeneration(item.id, true));
      const regenBtn = document.createElement("button");
      regenBtn.type = "button";
      regenBtn.className = "primary";
      regenBtn.textContent = "重新生成";
      regenBtn.addEventListener("click", () => regenerateTemplateItem(item.id));
      actions.append(copyBtn, reextractBtn, regenBtn);
      body.append(editor, referenceBlock, actions);
    } else {
      body.textContent = item.promptStatus === "failed" ? item.promptError : item.promptText;
    }
    row.appendChild(body);

    const riskBody = document.createElement("div");
    riskBody.className = `risk-body${showRiskControls && item.isRiskExpanded ? " show" : ""}`;
    if (item.riskStatus === "failed") {
      riskBody.textContent = item.riskError;
    } else if (item.riskStatus === "done") {
      riskBody.innerHTML = formatRiskResult(item);
    } else {
      riskBody.textContent = "排查结果仅供参考，请以平台规则和人工审核为准。";
    }
    row.appendChild(riskBody);

    row.appendChild(createReplacementPanel(item));
    if (isGraphicLayer(item)) {
      row.appendChild(createGraphicPropertiesPanel(item));
    } else if (!state.layerMode) {
      row.appendChild(createSidePaddingPanel(item));
    }

    refs.imageList.appendChild(row);
  }
}

function createSidePaddingPanel(item) {
  const padding = sidePaddingFor(item);
  const panel = document.createElement("div");
  panel.className = `side-padding-panel${padding.expanded ? " show" : ""}`;
  if (!padding.expanded) return panel;
  panel.addEventListener("click", event => event.stopPropagation());

  const metricsRow = document.createElement("div");
  metricsRow.className = "side-padding-metrics";

  const horizontalRow = document.createElement("label");
  horizontalRow.className = "side-padding-row";
  const horizontalInput = document.createElement("input");
  horizontalInput.className = "input side-padding-input";
  horizontalInput.type = "number";
  horizontalInput.step = "1";
  horizontalInput.placeholder = "左右边距";
  horizontalInput.value = padding.value !== 0 ? String(padding.value) : "";
  horizontalRow.append(horizontalInput);

  const topRow = document.createElement("label");
  topRow.className = "side-padding-row";
  const topInput = document.createElement("input");
  topInput.className = "input side-padding-input";
  topInput.type = "number";
  topInput.step = "1";
  topInput.placeholder = "上边距";
  topInput.value = padding.topValue !== 0 ? String(padding.topValue) : "";
  topRow.append(topInput);

  const bottomRow = document.createElement("label");
  bottomRow.className = "side-padding-row";
  const bottomInput = document.createElement("input");
  bottomInput.className = "input side-padding-input";
  bottomInput.type = "number";
  bottomInput.step = "1";
  bottomInput.placeholder = "下边距";
  bottomInput.value = padding.bottomValue !== 0 ? String(padding.bottomValue) : "";
  bottomRow.append(bottomInput);
  metricsRow.append(horizontalRow, topRow, bottomRow);

  const syncDraft = () => {
    padding.value = Math.round(Number(horizontalInput.value) || 0);
    padding.topValue = Math.round(Number(topInput.value) || 0);
    padding.bottomValue = Math.round(Number(bottomInput.value) || 0);
    padding.verticalValue = padding.topValue === padding.bottomValue ? padding.topValue : 0;
    padding.enabled = padding.value !== 0 || padding.topValue !== 0 || padding.bottomValue !== 0;
  };
  horizontalInput.addEventListener("input", syncDraft);
  topInput.addEventListener("input", syncDraft);
  bottomInput.addEventListener("input", syncDraft);

  const mode = document.createElement("select");
  mode.className = "input side-padding-mode";
  mode.innerHTML = `
    <option value="solid">纯色填充</option>
    <option value="edge">边缘延展</option>
    <option value="gradient">渐变融合</option>
    <option value="blur">模糊延展</option>
    <option value="mirror">镜像延展</option>
    <option value="microShadow">微阴影分区</option>
  `;
  mode.value = padding.mode || DEFAULT_SIDE_PADDING_MODE;

  const microShadowRow = document.createElement("label");
  microShadowRow.className = "side-padding-row";
  microShadowRow.title = "色差百分比";
  const microShadowInput = document.createElement("input");
  microShadowInput.className = "input side-padding-input";
  microShadowInput.type = "number";
  microShadowInput.min = "1";
  microShadowInput.max = "20";
  microShadowInput.step = "1";
  microShadowInput.placeholder = "色差百分比";
  microShadowInput.value = String(normalizeMicroShadowPercent(padding.microShadowPercent));
  microShadowRow.append(microShadowInput);
  microShadowRow.hidden = mode.value !== "microShadow";

  const colorRow = document.createElement("div");
  colorRow.className = "side-padding-color-row";
  colorRow.hidden = mode.value !== "solid";
  const eyedropper = document.createElement("button");
  eyedropper.type = "button";
  eyedropper.className = "icon-button side-padding-eyedropper";
  eyedropper.title = "吸取边距填充色";
  eyedropper.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.7 4.3a2.4 2.4 0 0 1 3.4 0l1.6 1.6a2.4 2.4 0 0 1 0 3.4l-2 2 1.4 1.4-1.4 1.4-7.8-7.8 1.4-1.4 1.4 1.4 2-2Z"></path><path d="m8.9 7.3 7.8 7.8-6.2 6.2H6.4l-2.1-2.1v-4.1l6.2-6.2-1.6-1.6Z"></path></svg>`;
  const colorSwatch = document.createElement("span");
  colorSwatch.className = "side-padding-swatch";
  colorSwatch.style.background = padding.color || state.spacingColor || DEFAULT_COLOR;
  const colorInput = document.createElement("input");
  colorInput.className = "side-padding-color-input";
  colorInput.type = "text";
  colorInput.value = padding.color || state.spacingColor || DEFAULT_COLOR;
  colorInput.addEventListener("input", () => {
    const color = normalizeHexColor(colorInput.value);
    if (color) {
      padding.color = color;
      colorSwatch.style.background = color;
    }
  });
  eyedropper.addEventListener("click", async event => {
    event.stopPropagation();
    const color = await pickSidePaddingColor(item.id);
    if (!color) return;
    padding.color = color;
    colorInput.value = color;
    colorSwatch.style.background = color;
    item.sidePadding = normalizeSidePadding(padding);
    scheduleRenderPreview();
    renderList();
  });
  colorRow.append(eyedropper, colorSwatch, colorInput);

  mode.addEventListener("change", () => {
    padding.mode = mode.value;
    padding.microShadowPercent = normalizeMicroShadowPercent(microShadowInput.value);
    padding.enabled = padding.value !== 0 || padding.topValue !== 0 || padding.bottomValue !== 0;
    colorRow.hidden = mode.value !== "solid";
    microShadowRow.hidden = mode.value !== "microShadow";
    item.sidePadding = normalizeSidePadding(padding);
    scheduleRenderPreview();
    renderList();
  });
  microShadowInput.addEventListener("input", () => {
    padding.microShadowPercent = normalizeMicroShadowPercent(microShadowInput.value);
    microShadowInput.value = String(padding.microShadowPercent);
    item.sidePadding = normalizeSidePadding(padding);
    scheduleRenderPreview();
  });

  const apply = document.createElement("button");
  apply.type = "button";
  apply.className = "icon-button side-padding-apply";
  apply.title = "应用边距";
  apply.textContent = "✓";
  apply.addEventListener("click", event => {
    event.stopPropagation();
    padding.value = Math.round(Number(horizontalInput.value) || 0);
    padding.topValue = Math.round(Number(topInput.value) || 0);
    padding.bottomValue = Math.round(Number(bottomInput.value) || 0);
    padding.verticalValue = padding.topValue === padding.bottomValue ? padding.topValue : 0;
    padding.mode = mode.value;
    padding.microShadowPercent = normalizeMicroShadowPercent(microShadowInput.value);
    padding.color = normalizeHexColor(colorInput.value || padding.color || state.spacingColor) || state.spacingColor || DEFAULT_COLOR;
    padding.enabled = padding.value !== 0 || padding.topValue !== 0 || padding.bottomValue !== 0;
    item.sidePadding = normalizeSidePadding(padding);
    scheduleRenderPreview();
    renderList();
  });

  const collapse = document.createElement("button");
  collapse.type = "button";
  collapse.className = "icon-button side-padding-apply";
  collapse.title = "收起";
  collapse.textContent = "×";
  collapse.addEventListener("click", event => {
    event.stopPropagation();
    padding.expanded = false;
    item.sidePadding = normalizeSidePadding(padding);
    renderList();
  });

  const controlRow = document.createElement("div");
  controlRow.className = "side-padding-control-row";
  controlRow.append(mode, apply, collapse);
  panel.append(metricsRow, controlRow, microShadowRow, colorRow);
  return panel;
}

function toggleGraphicPropertiesPanel(itemId) {
  const target = state.items.find(item => item.id === itemId);
  if (!target || !isGraphicLayer(target)) return;
  const willOpen = !target.graphicPropertiesExpanded;
  for (const item of state.items) {
    item.graphicPropertiesExpanded = item.id === itemId ? willOpen : false;
    if (willOpen || item.id !== itemId) item.isReplacementExpanded = false;
  }
  renderList();
}

function paintSwatchBackground(paint) {
  const normalized = normalizePaint(paint, "#000000");
  return normalized.mode === "gradient"
    ? `linear-gradient(${normalized.angle ?? 90}deg, ${rgbaFromColorAlpha(normalized.color, normalized.alpha)}, ${rgbaFromColorAlpha(normalized.color2 || normalized.color, normalized.alpha2)})`
    : rgbaFromColorAlpha(normalized.color, normalized.alpha);
}

function rgbaFromPaint(paint, fallback = "#000000") {
  const normalized = normalizePaint(paint, fallback);
  return rgbaFromColorAlpha(normalized.color, normalized.alpha, fallback);
}

function rectPreviewBackground(layer = {}) {
  const fill = normalizePaint(layer.fill, "#FFFFFF");
  if (fill.mode === "gradient") {
    return `linear-gradient(${fill.angle ?? 90}deg, ${rgbaFromColorAlpha(fill.color, fill.alpha, "#FFFFFF")}, ${rgbaFromColorAlpha(fill.color2 || fill.color, fill.alpha2, "#FFFFFF")})`;
  }
  return rgbaFromPaint(fill, "#FFFFFF");
}

function applyRectPreviewStyle(element, layer = {}, displayScale = 1) {
  const fill = normalizePaint(layer.fill, "#FFFFFF");
  const stroke = normalizePaint(layer.stroke, "#FFFFFF");
  const strokeWidth = Math.max(0, Number(layer.strokeWidth) || 0) * displayScale;
  const strokeAlign = strokeAlignFor(layer);
  const radius = Math.max(0, Number(layer.radius) || 0) * displayScale;
  const blur = Math.max(0, Number(layer.blur) || 0) * displayScale;
  element.style.borderRadius = `${radius}px`;
  element.style.filter = blur > 0 ? `blur(${blur}px)` : "";
  element.style.border = "0 solid transparent";
  element.style.boxShadow = "";
  if (strokeWidth > 0 && stroke.mode === "gradient") {
    element.style.border = `${strokeWidth}px solid transparent`;
    element.style.background = `${rectPreviewBackground(layer)} padding-box, ${paintSwatchBackground(stroke)} border-box`;
  } else {
    element.style.background = rectPreviewBackground(layer);
    if (strokeWidth > 0) {
      const color = rgbaFromPaint(stroke, "#FFFFFF");
      if (strokeAlign === "inner") {
        element.style.boxShadow = `inset 0 0 0 ${strokeWidth}px ${color}`;
      } else if (strokeAlign === "outer") {
        element.style.boxShadow = `0 0 0 ${strokeWidth}px ${color}`;
      } else {
        const half = Math.max(1, strokeWidth / 2);
        element.style.boxShadow = `inset 0 0 0 ${half}px ${color}, 0 0 0 ${half}px ${color}`;
      }
    }
  }
}

function layerRectForItem(item) {
  const transform = layerTransformFor(item);
  const scaleX = transform.scaleX || transform.scale || 1;
  const scaleY = transform.scaleY || transform.scale || 1;
  return {
    id: item.id,
    x: transform.x,
    y: transform.y,
    width: item.width * scaleX,
    height: item.height * scaleY
  };
}

function snapTargets(excludeIds = new Set()) {
  const bounds = ensureLayerBounds(false);
  const xTargets = [
    { value: 0, priority: 2 },
    { value: bounds.width / 2, priority: 1 },
    { value: bounds.width, priority: 2 }
  ];
  const yTargets = [
    { value: 0, priority: 2 },
    { value: bounds.height / 2, priority: 1 },
    { value: bounds.height, priority: 2 }
  ];
  for (const item of state.items) {
    if (excludeIds.has(item.id)) continue;
    const rect = layerRectForItem(item);
    xTargets.push({ value: rect.x, priority: 3 }, { value: rect.x + rect.width / 2, priority: 3 }, { value: rect.x + rect.width, priority: 3 });
    yTargets.push({ value: rect.y, priority: 3 }, { value: rect.y + rect.height / 2, priority: 3 }, { value: rect.y + rect.height, priority: 3 });
  }
  return { xTargets, yTargets };
}

function bestSnap(points, targets) {
  let best = null;
  for (const point of points) {
    for (const target of targets) {
      const distance = Math.abs(target.value - point.value);
      if (distance > SNAP_THRESHOLD) continue;
      if (!best || distance < best.distance || (distance === best.distance && target.priority < best.priority)) {
        best = { delta: target.value - point.value, position: target.value, distance, priority: target.priority };
      }
    }
  }
  return best;
}

function getMoveSnapResult(rect, excludeIds = new Set()) {
  const { xTargets, yTargets } = snapTargets(excludeIds);
  const xSnap = bestSnap([
    { value: rect.x },
    { value: rect.x + rect.width / 2 },
    { value: rect.x + rect.width }
  ], xTargets);
  const ySnap = bestSnap([
    { value: rect.y },
    { value: rect.y + rect.height / 2 },
    { value: rect.y + rect.height }
  ], yTargets);
  return {
    x: rect.x + (xSnap?.delta || 0),
    y: rect.y + (ySnap?.delta || 0),
    guides: [
      ...(xSnap ? [{ type: "vertical", position: xSnap.position }] : []),
      ...(ySnap ? [{ type: "horizontal", position: ySnap.position }] : [])
    ]
  };
}

function getResizeSnapResult(rect, direction, excludeIds = new Set()) {
  const { xTargets, yTargets } = snapTargets(excludeIds);
  const next = { ...rect, guides: [] };
  if (direction.includes("e")) {
    const snap = bestSnap([{ value: rect.x + rect.width }], xTargets);
    if (snap) {
      const width = snap.position - rect.x;
      if (width >= MIN_LAYER_WIDTH) {
        next.width = width;
        next.guides.push({ type: "vertical", position: snap.position });
      }
    }
  } else if (direction.includes("w")) {
    const snap = bestSnap([{ value: rect.x }], xTargets);
    if (snap) {
      const right = rect.x + rect.width;
      const width = right - snap.position;
      if (width >= MIN_LAYER_WIDTH) {
        next.x = snap.position;
        next.width = width;
        next.guides.push({ type: "vertical", position: snap.position });
      }
    }
  }
  if (direction.includes("s")) {
    const snap = bestSnap([{ value: rect.y + rect.height }], yTargets);
    if (snap) {
      const height = snap.position - rect.y;
      if (height >= MIN_LAYER_HEIGHT) {
        next.height = height;
        next.guides.push({ type: "horizontal", position: snap.position });
      }
    }
  } else if (direction.includes("n")) {
    const snap = bestSnap([{ value: rect.y }], yTargets);
    if (snap) {
      const bottom = rect.y + rect.height;
      const height = bottom - snap.position;
      if (height >= MIN_LAYER_HEIGHT) {
        next.y = snap.position;
        next.height = height;
        next.guides.push({ type: "horizontal", position: snap.position });
      }
    }
  }
  return next;
}

function renderSnapGuides(stage, displayScale) {
  stage.querySelectorAll(".snap-guide").forEach(element => element.remove());
  for (const guide of state.snapGuides || []) {
    const line = document.createElement("div");
    line.className = `snap-guide ${guide.type}`;
    if (guide.type === "vertical") {
      line.style.left = `${guide.position * displayScale}px`;
    } else {
      line.style.top = `${guide.position * displayScale}px`;
    }
    stage.appendChild(line);
  }
}

function updateSnapGuides(guides, displayScale) {
  state.snapGuides = guides || [];
  const stage = refs.previewCanvas.querySelector(".layer-stage");
  if (stage) renderSnapGuides(stage, displayScale);
}

function materializeRectLayerSize(item) {
  if (item?.type !== "rect") return;
  const transform = layerTransformFor(item);
  item.width = Math.max(1, Math.round(item.width * (transform.scaleX || transform.scale || 1)));
  item.height = Math.max(1, Math.round(item.height * (transform.scaleY || transform.scale || 1)));
  transform.scale = 1;
  transform.scaleX = 1;
  transform.scaleY = 1;
  item.layerTransform = transform;
}

function closeOtherColorPopovers(current) {
  document.querySelectorAll(".graphic-color-popover").forEach(popover => {
    if (popover !== current) popover.hidden = true;
  });
}

function createPaintEditor(item, layer, key, placeholder, fallback) {
  layer[key] = normalizePaint(layer[key], fallback);
  const row = document.createElement("div");
  row.className = "graphic-paint-row";
  const swatch = document.createElement("button");
  swatch.type = "button";
  swatch.className = "graphic-color-swatch";
  swatch.style.background = paintSwatchBackground(layer[key]);
  const input = document.createElement("input");
  input.className = "input graphic-color-input";
  input.type = "text";
  input.placeholder = placeholder;
  input.value = layer[key].color || fallback;
  const applyPaint = async () => {
    const color = normalizeHexColor(input.value);
    if (color) layer[key].color = color;
    await applyToSameKindSelection(item, target => {
      const targetLayer = target.type === "text" ? target.textLayer : target.rectLayer;
      if (targetLayer) targetLayer[key] = JSON.parse(JSON.stringify(layer[key]));
    }, { render: "all" });
  };
  input.addEventListener("change", applyPaint);
  const picker = document.createElement("div");
  picker.className = "graphic-color-popover";
  picker.hidden = true;
  picker.addEventListener("click", event => event.stopPropagation());
  const modeGroup = document.createElement("div");
  modeGroup.className = "graphic-mode-segment";
  const solidMode = document.createElement("label");
  solidMode.className = "graphic-mode-option";
  const solidRadio = document.createElement("input");
  solidRadio.type = "radio";
  solidRadio.name = `paint-mode-${item.id}-${key}`;
  solidRadio.value = "solid";
  const solidLabel = document.createElement("span");
  solidLabel.textContent = "纯色填充";
  solidMode.append(solidRadio, solidLabel);
  const gradientMode = document.createElement("label");
  gradientMode.className = "graphic-mode-option";
  const gradientRadio = document.createElement("input");
  gradientRadio.type = "radio";
  gradientRadio.name = `paint-mode-${item.id}-${key}`;
  gradientRadio.value = "gradient";
  const gradientLabel = document.createElement("span");
  gradientLabel.textContent = "渐变填充";
  gradientMode.append(gradientRadio, gradientLabel);
  modeGroup.append(solidMode, gradientMode);
  const syncModeControl = () => {
    solidRadio.checked = layer[key].mode !== "gradient";
    gradientRadio.checked = layer[key].mode === "gradient";
  };
  syncModeControl();
  const colorInput = document.createElement("input");
  colorInput.type = "color";
  colorInput.value = layer[key].color || fallback;
  const color2Input = document.createElement("input");
  color2Input.type = "color";
  color2Input.value = layer[key].color2 || layer[key].color || fallback;
  color2Input.hidden = layer[key].mode !== "gradient";
  const popAlpha = document.createElement("input");
  popAlpha.className = "input graphic-alpha-input";
  popAlpha.type = "number";
  popAlpha.min = "0";
  popAlpha.max = "100";
  popAlpha.step = "1";
  popAlpha.placeholder = "透明度";
  const alphaPercent = Math.round(clampAlpha(layer[key].alpha, 1) * 100);
  popAlpha.value = alphaPercent === 100 ? "" : String(alphaPercent);
  const popAlpha2 = document.createElement("input");
  popAlpha2.className = "input graphic-alpha-input graphic-alpha-end-input";
  popAlpha2.type = "number";
  popAlpha2.min = "0";
  popAlpha2.max = "100";
  popAlpha2.step = "1";
  popAlpha2.placeholder = "终点透明度";
  const alpha2Percent = Math.round(clampAlpha(layer[key].alpha2, layer[key].alpha) * 100);
  popAlpha2.value = alpha2Percent === 100 ? "" : String(alpha2Percent);
  popAlpha2.hidden = layer[key].mode !== "gradient";
  const angleControl = document.createElement("button");
  angleControl.type = "button";
  angleControl.className = "gradient-angle-control";
  angleControl.hidden = layer[key].mode !== "gradient";
  const angleDot = document.createElement("span");
  angleDot.className = "gradient-angle-dot";
  angleControl.append(angleDot);
  const angleInput = document.createElement("input");
  angleInput.className = "input gradient-angle-input";
  angleInput.type = "number";
  angleInput.min = "0";
  angleInput.max = "360";
  angleInput.step = "1";
  angleInput.placeholder = "渐变角度";
  angleInput.value = layer[key].angle ? String(Math.round(layer[key].angle)) : "";
  const syncAngleControl = () => {
    const angle = Number(layer[key].angle) || 90;
    const rad = angle * Math.PI / 180;
    const controlSize = angleControl.clientWidth || 34;
    const center = controlSize / 2;
    const radius = Math.max(4, center - 6);
    angleDot.style.left = `${center + Math.sin(rad) * radius}px`;
    angleDot.style.top = `${center - Math.cos(rad) * radius}px`;
    angleInput.value = String(Math.round(angle));
  };
  const setAngleFromPointer = event => {
    const rect = angleControl.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = event.clientX - cx;
    const dy = event.clientY - cy;
    if (Math.hypot(dx, dy) > rect.width / 2) return;
    layer[key].angle = (Math.atan2(dy, dx) * 180 / Math.PI + 90 + 360) % 360;
    syncAngleControl();
    syncPicker();
  };
  angleControl.addEventListener("pointerdown", event => {
    event.preventDefault();
    setAngleFromPointer(event);
  });
  const syncPicker = async () => {
    layer[key].color = normalizeHexColor(colorInput.value) || layer[key].color || fallback;
    layer[key].color2 = normalizeHexColor(color2Input.value) || layer[key].color2 || layer[key].color;
    layer[key].alpha = alphaPercentFromInput(popAlpha, layer[key].alpha);
    layer[key].alpha2 = layer[key].mode === "gradient"
      ? alphaPercentFromInput(popAlpha2, layer[key].alpha2)
      : layer[key].alpha;
    input.value = layer[key].color;
    color2Input.hidden = layer[key].mode !== "gradient";
    popAlpha.placeholder = layer[key].mode === "gradient" ? "起点透明度" : "透明度";
    popAlpha2.hidden = layer[key].mode !== "gradient";
    angleControl.hidden = layer[key].mode !== "gradient";
    angleInput.hidden = layer[key].mode !== "gradient";
    syncModeControl();
    syncAngleControl();
    swatch.style.background = paintSwatchBackground(layer[key]);
    await applyToSameKindSelection(item, target => {
      const targetLayer = target.type === "text" ? target.textLayer : target.rectLayer;
      if (targetLayer) targetLayer[key] = JSON.parse(JSON.stringify(layer[key]));
    });
  };
  const syncPickerVisibility = () => {
    color2Input.hidden = layer[key].mode !== "gradient";
    popAlpha.placeholder = layer[key].mode === "gradient" ? "起点透明度" : "透明度";
    popAlpha2.hidden = layer[key].mode !== "gradient";
    angleControl.hidden = layer[key].mode !== "gradient";
    angleInput.hidden = layer[key].mode !== "gradient";
    syncModeControl();
    syncAngleControl();
  };
  modeGroup.addEventListener("change", event => {
    layer[key].mode = event.target.value === "gradient" ? "gradient" : "solid";
    syncPicker();
  });
  colorInput.addEventListener("input", syncPicker);
  color2Input.addEventListener("input", syncPicker);
  popAlpha.addEventListener("input", syncPicker);
  popAlpha2.addEventListener("input", syncPicker);
  angleInput.addEventListener("input", () => {
    layer[key].angle = ((Number(angleInput.value) || 0) % 360 + 360) % 360;
    syncPicker();
  });
  syncAngleControl();
  picker.append(modeGroup, colorInput, color2Input, popAlpha, popAlpha2, angleControl, angleInput);
  swatch.addEventListener("click", event => {
    event.stopPropagation();
    const willShow = picker.hidden;
    closeOtherColorPopovers(picker);
    syncPickerVisibility();
    picker.hidden = !willShow;
  });
  row.append(swatch, input, picker);
  return row;
}

function createStrokeAlignSelect(item, layer, onApply) {
  const select = document.createElement("select");
  select.className = "input graphic-stroke-align-select";
  for (const option of STROKE_ALIGN_OPTIONS) {
    const element = document.createElement("option");
    element.value = option.value;
    element.textContent = option.label;
    select.appendChild(element);
  }
  select.value = strokeAlignFor(layer);
  select.addEventListener("change", async () => {
    layer.strokeAlign = normalizeStrokeAlign(select.value);
    await applyToSameKindSelection(item, target => {
      const targetLayer = target.type === "text" ? target.textLayer : target.rectLayer;
      if (targetLayer) targetLayer.strokeAlign = layer.strokeAlign;
    }, { render: "all" });
    await onApply(false);
  });
  return select;
}

function createGraphicPropertiesPanel(item) {
  const panel = document.createElement("div");
  panel.className = `graphic-properties-panel${item.graphicPropertiesExpanded ? " show" : ""}`;
  if (!item.graphicPropertiesExpanded) return panel;
  panel.addEventListener("click", event => event.stopPropagation());

  if (item.type === "text") {
    const layer = item.textLayer;
    const textInput = document.createElement("input");
    textInput.className = "input graphic-text-input";
    textInput.value = layer.text || TEXT_LAYER_DEFAULT_TEXT;
    textInput.addEventListener("input", () => {
      layer.text = textInput.value || TEXT_LAYER_DEFAULT_TEXT;
      layer.replacements = [layer.text, ...(layer.replacements || []).slice(1)];
      item.name = layer.text;
      syncTextLayerGeometry(item);
      clearTimeout(item.graphicRenderTimer);
      item.graphicRenderTimer = setTimeout(async () => {
        await saveGraphicItemImage(item);
        scheduleRenderPreview();
      }, 160);
    });

    const fontRow = document.createElement("div");
    fontRow.className = "graphic-property-row graphic-font-row";
    if (layer.boxFit) fontRow.classList.add("box-fit-font-row");
    const fontSelect = document.createElement("select");
    fontSelect.className = "input";
    for (const font of FONT_OPTIONS) {
      const option = document.createElement("option");
      option.value = font;
      option.textContent = font;
      fontSelect.appendChild(option);
    }
    fontSelect.value = layer.fontFamily || "思源黑体";
    fontSelect.addEventListener("change", async () => {
      layer.fontFamily = fontSelect.value;
      await applyToSameKindSelection(item, target => {
        target.textLayer.fontFamily = layer.fontFamily;
        syncTextLayerGeometry(target);
      }, { render: "all" });
    });
    const weightSelect = document.createElement("select");
    weightSelect.className = "input graphic-weight-select";
    for (const weight of FONT_WEIGHT_OPTIONS) {
      const option = document.createElement("option");
      option.value = String(weight.value);
      option.textContent = weight.label;
      weightSelect.appendChild(option);
    }
    weightSelect.value = String(layer.fontWeight || 400);
    weightSelect.addEventListener("change", async () => {
      layer.fontWeight = Number(weightSelect.value) || 400;
      await applyToSameKindSelection(item, target => {
        target.textLayer.fontWeight = layer.fontWeight;
        syncTextLayerGeometry(target);
      }, { render: "all" });
    });
    const sizeInput = document.createElement("input");
    sizeInput.className = "input graphic-number-input";
    sizeInput.type = "number";
    sizeInput.min = "8";
    sizeInput.placeholder = "字号";
    sizeInput.value = String(layer.fontSize || 48);
    sizeInput.hidden = Boolean(layer.boxFit);
    sizeInput.addEventListener("input", async () => {
      layer.fontSize = Math.max(8, Number(sizeInput.value) || 48);
      await applyToSameKindSelection(item, target => {
        target.textLayer.fontSize = layer.fontSize;
        syncTextLayerGeometry(target);
      });
    });
    fontRow.append(fontSelect, weightSelect, sizeInput);
    panel.append(textInput, fontRow);
    const alignRow = document.createElement("div");
    alignRow.className = "graphic-align-row";
    for (const option of [
      { value: "left", label: "左对齐" },
      { value: "center", label: "居中对齐" },
      { value: "right", label: "右对齐" }
    ]) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `graphic-align-button align-${option.value}${(layer.align || "center") === option.value ? " active" : ""}`;
      button.title = option.label;
      button.setAttribute("aria-label", option.label);
      for (let lineIndex = 0; lineIndex < 3; lineIndex += 1) {
        const line = document.createElement("span");
        line.className = "align-icon-line";
        button.appendChild(line);
      }
      button.addEventListener("click", async () => {
        layer.align = option.value;
        await applyToSameKindSelection(item, target => {
          target.textLayer.align = layer.align;
        }, { render: "all" });
      });
      alignRow.appendChild(button);
    }
    panel.append(alignRow);
    panel.append(createPaintEditor(item, layer, "fill", "填充颜色", "#000000"));
    const strokeRow = document.createElement("div");
    strokeRow.className = "graphic-property-row graphic-stroke-row";
    strokeRow.append(createPaintEditor(item, layer, "stroke", "描边颜色", "#000000"));
    const strokeAlign = createStrokeAlignSelect(item, layer, async () => {
      syncTextLayerGeometry(item);
      await saveGraphicItemImage(item);
      renderAll();
    });
    const strokeWidth = document.createElement("input");
    strokeWidth.className = "input graphic-number-input";
    strokeWidth.type = "number";
    strokeWidth.min = "0";
    strokeWidth.placeholder = "描边粗细";
    strokeWidth.value = layer.strokeWidth > 0 ? String(layer.strokeWidth) : "";
    strokeWidth.addEventListener("input", async () => {
      layer.strokeWidth = Math.max(0, Number(strokeWidth.value) || 0);
      await applyToSameKindSelection(item, target => {
        target.textLayer.strokeWidth = layer.strokeWidth;
        syncTextLayerGeometry(target);
      });
    });
    strokeRow.append(strokeAlign, strokeWidth);
    panel.append(strokeRow);
  } else if (item.type === "rect") {
    const layer = item.rectLayer;
    panel.append(createPaintEditor(item, layer, "fill", "填充颜色", "#FFFFFF"));
    const strokeRow = document.createElement("div");
    strokeRow.className = "graphic-property-row graphic-stroke-row";
    strokeRow.append(createPaintEditor(item, layer, "stroke", "描边颜色", "#FFFFFF"));
    const strokeAlign = createStrokeAlignSelect(item, layer, async () => {
      await saveGraphicItemImage(item);
      renderAll();
    });
    const strokeWidth = document.createElement("input");
    strokeWidth.className = "input graphic-number-input";
    strokeWidth.type = "number";
    strokeWidth.min = "0";
    strokeWidth.placeholder = "描边粗细";
    strokeWidth.value = layer.strokeWidth > 0 ? String(layer.strokeWidth) : "";
    strokeWidth.addEventListener("input", async () => {
      layer.strokeWidth = Math.max(0, Number(strokeWidth.value) || 0);
      await applyToSameKindSelection(item, target => {
        target.rectLayer.strokeWidth = layer.strokeWidth;
      });
    });
    strokeRow.append(strokeAlign, strokeWidth);
    panel.append(strokeRow);
    const radiusWrap = document.createElement("div");
    radiusWrap.className = "radius-input-wrap";
    const radiusIcon = document.createElement("button");
    radiusIcon.type = "button";
    radiusIcon.className = "radius-drag-icon";
    radiusIcon.title = "拖动调整圆角";
    const radius = document.createElement("input");
    radius.className = "input radius-input";
    radius.type = "number";
    radius.min = "0";
    radius.placeholder = "圆角度数";
    radius.value = layer.radius > 0 ? String(layer.radius) : "";
    const applyRadius = async () => {
      layer.radius = Math.max(0, Number(radius.value) || 0);
      await applyToSameKindSelection(item, target => {
        target.rectLayer.radius = layer.radius;
      });
    };
    radius.addEventListener("input", applyRadius);
    radiusIcon.addEventListener("pointerdown", event => {
      event.preventDefault();
      event.stopPropagation();
      const startX = event.clientX;
      const startValue = Math.max(0, Number(radius.value) || Number(layer.radius) || 0);
      const onMove = moveEvent => {
        const nextValue = Math.max(0, Math.round(startValue + (moveEvent.clientX - startX) / 2));
        radius.value = String(nextValue);
        layer.radius = nextValue;
        applyToSameKindSelection(item, target => {
          target.rectLayer.radius = nextValue;
        }).catch(() => {});
      };
      const onUp = () => {
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
        document.removeEventListener("pointercancel", onUp);
        renderAll();
      };
      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp, { once: true });
      document.addEventListener("pointercancel", onUp, { once: true });
    });
    radiusWrap.append(radiusIcon, radius);
    panel.append(radiusWrap);

    const blurWrap = document.createElement("div");
    blurWrap.className = "radius-input-wrap";
    const blurIcon = document.createElement("button");
    blurIcon.type = "button";
    blurIcon.className = "blur-drag-icon";
    blurIcon.title = "拖动调整边缘虚化";
    const blur = document.createElement("input");
    blur.className = "input radius-input";
    blur.type = "number";
    blur.min = "0";
    blur.placeholder = "虚化数值";
    blur.value = layer.blur > 0 ? String(layer.blur) : "";
    const applyBlur = async () => {
      layer.blur = Math.max(0, Number(blur.value) || 0);
      await applyToSameKindSelection(item, target => {
        target.rectLayer.blur = layer.blur;
      });
    };
    blur.addEventListener("input", applyBlur);
    blurIcon.addEventListener("pointerdown", event => {
      event.preventDefault();
      event.stopPropagation();
      const startX = event.clientX;
      const startValue = Math.max(0, Number(blur.value) || Number(layer.blur) || 0);
      const onMove = moveEvent => {
        const nextValue = Math.max(0, Math.round(startValue + (moveEvent.clientX - startX) / 2));
        blur.value = String(nextValue);
        layer.blur = nextValue;
        applyToSameKindSelection(item, target => {
          target.rectLayer.blur = nextValue;
        }).catch(() => {});
      };
      const onUp = () => {
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
        document.removeEventListener("pointercancel", onUp);
        renderAll();
      };
      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp, { once: true });
      document.addEventListener("pointercancel", onUp, { once: true });
    });
    blurWrap.append(blurIcon, blur);
    panel.append(blurWrap);
  }
  return panel;
}

function replacementButtonLabel(item) {
  const count = item.type === "text" ? textReplacementCount(item) : (item.replacementItems?.length || 0);
  return count ? `替换 ${count}` : "替换";
}

function createReplacementPanel(item) {
  const panel = document.createElement("div");
  panel.className = `replacement-panel${item.isReplacementExpanded ? " show" : ""}`;
  if (!item.isReplacementExpanded) return panel;
  panel.addEventListener("click", event => event.stopPropagation());
  if (item.type === "text") {
    const layer = item.textLayer;
    if (!Array.isArray(layer.replacements) || !layer.replacements.length) {
      layer.replacements = [layer.text || TEXT_LAYER_DEFAULT_TEXT];
    }
    const list = document.createElement("div");
    list.className = "text-replacement-list";
    const updateReplacementButton = () => {
      const button = refs.imageList.querySelector(`[data-id="${item.id}"] .replacement-toggle`);
      if (button) button.textContent = replacementButtonLabel(item);
    };
    const syncTextRows = () => {
      list.innerHTML = "";
      layer.replacements.forEach((value, index) => {
        const row = document.createElement("label");
        row.className = "text-replacement-row";
        const indexLabel = document.createElement("span");
        indexLabel.textContent = String(index + 1);
        const input = document.createElement("input");
        input.className = "input";
        input.value = value;
        input.addEventListener("input", () => {
          layer.replacements[index] = input.value;
        });
        input.addEventListener("paste", event => {
          const text = event.clipboardData?.getData("text/plain") || "";
          if (!text.includes("\n") && !text.includes("\r")) return;
          event.preventDefault();
          const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
          if (!lines.length) return;
          layer.replacements.splice(index, 1, ...lines);
          syncTextRows();
          updateReplacementButton();
          requestAnimationFrame(() => list.querySelectorAll("input")[index + lines.length - 1]?.focus());
        });
        input.addEventListener("keydown", event => {
          if (event.key === "Enter") {
            event.preventDefault();
            layer.replacements.splice(index + 1, 0, "");
            syncTextRows();
            updateReplacementButton();
            requestAnimationFrame(() => list.querySelectorAll("input")[index + 1]?.focus());
          }
        });
        if (index > 0) {
          const remove = document.createElement("button");
          remove.type = "button";
          remove.className = "replacement-remove text-replacement-remove";
          remove.textContent = "×";
          remove.title = "删除该行";
          remove.addEventListener("click", event => {
            event.preventDefault();
            layer.replacements.splice(index, 1);
            syncTextRows();
            updateReplacementButton();
          });
          row.append(indexLabel, input, remove);
        } else {
          const spacer = document.createElement("span");
          spacer.className = "text-replacement-remove-spacer";
          row.append(indexLabel, input, spacer);
        }
        list.appendChild(row);
      });
    };
    syncTextRows();
    panel.appendChild(list);
    return panel;
  }
  panel.addEventListener("dragover", event => {
    event.preventDefault();
    panel.classList.add("drag-over");
  });
  panel.addEventListener("dragleave", () => panel.classList.remove("drag-over"));
  panel.addEventListener("drop", event => {
    event.preventDefault();
    panel.classList.remove("drag-over");
    if (event.dataTransfer?.files?.length) {
      importBrowserReplacementFiles(item.id, event.dataTransfer.files);
    }
  });

  const hint = document.createElement("button");
  hint.type = "button";
  hint.className = "replacement-drop-hint";
  hint.textContent = "拖入 / 粘贴 / 点击添加替换图";
  hint.addEventListener("click", () => chooseReplacementImages(item.id));

  const grid = document.createElement("div");
  grid.className = "replacement-grid";
  if (!item.replacementItems?.length) {
    const empty = document.createElement("div");
    empty.className = "replacement-empty";
    empty.textContent = "暂无替换图";
    grid.appendChild(empty);
  } else {
    for (const [index, replacement] of item.replacementItems.entries()) {
      grid.appendChild(createReplacementCard(item, replacement, index));
    }
  }

  const actions = document.createElement("div");
  actions.className = "replacement-actions";
  if (state.layerMode) {
    const blendWrap = document.createElement("label");
    blendWrap.className = "replacement-blend-control";
    const blendText = document.createElement("span");
    blendText.textContent = "图层样式";
    const blendSelect = document.createElement("select");
    blendSelect.className = "replacement-blend-select";
    for (const mode of LAYER_BLEND_MODES) {
      const option = document.createElement("option");
      option.value = mode.value;
      option.textContent = mode.label;
      blendSelect.appendChild(option);
    }
    blendSelect.value = layerBlendModeFor(item);
    blendSelect.addEventListener("change", event => {
      item.layerBlendMode = normalizeLayerBlendMode(event.target.value);
      renderAll();
    });
    blendWrap.append(blendText, blendSelect);
    actions.append(blendWrap);
  }
  const addPlaceholder = document.createElement("button");
  addPlaceholder.type = "button";
  addPlaceholder.className = "weak";
  addPlaceholder.textContent = "添加占位";
  addPlaceholder.addEventListener("click", () => addReplacementPlaceholder(item.id));
  actions.append(addPlaceholder);

  panel.append(hint, grid, actions);
  return panel;
}

function createReplacementCard(item, replacement, index) {
  const card = document.createElement("div");
  card.className = `replacement-card ${replacement.type}`;
  if (state.layerMode && state.layerReplacementPreview.get(item.id)?.index === index) {
    card.classList.add("previewing");
  }
  card.draggable = false;
  card.dataset.id = replacement.id;
  card.title = replacement.name || "占位";
  card.addEventListener("pointerdown", event => startReplacementSort(item.id, replacement.id, event));
  card.addEventListener("click", event => {
    if (card.dataset.dragMoved === "1") {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (replacement.type === "placeholder") {
      showToast("我没有图，只是占个位置~");
      return;
    }
    if (state.layerMode) {
      if (replacement.type === "placeholder") return;
      if (state.layerReplacementPreview.get(item.id)?.index === index) {
        clearLayerReplacementPreview(item.id);
      } else {
        replacementEffectPreviewUrl(item, replacement, index)
          .then(url => {
            clearLayerReplacementPreview(item.id);
            state.layerReplacementPreview.set(item.id, { index, url });
            state.selectedIds = new Set([item.id]);
            renderAll();
            requestAnimationFrame(() => scrollListToImage(item.id));
          })
          .catch(() => showToast("替换预览生成失败"));
        return;
      }
      state.selectedIds = new Set([item.id]);
      renderAll();
      requestAnimationFrame(() => scrollListToImage(item.id));
      return;
    }
    openProductPreview(replacement.previewUrl || replacement.url);
  });

  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "replacement-remove";
  remove.textContent = "×";
  remove.draggable = false;
  remove.addEventListener("click", event => {
    event.stopPropagation();
    removeReplacementItem(item.id, replacement.id);
  });
  const indexLabel = document.createElement("span");
  indexLabel.className = "replacement-index";
  indexLabel.textContent = String(index + 1);
  card.append(indexLabel, remove);

  if (replacement.type === "placeholder") {
    const placeholder = document.createElement("div");
    placeholder.className = "replacement-placeholder";
    placeholder.textContent = "占位";
    card.appendChild(placeholder);
  } else {
    const image = document.createElement("img");
    image.src = replacement.previewUrl || replacement.url;
    image.alt = replacement.name || "替换图";
    image.draggable = false;
    card.appendChild(image);
  }
  return card;
}

function createReferenceBlock(item) {
  const block = document.createElement("div");
  block.className = "reference-block";
  block.dataset.referenceItemId = item.id;

  const head = document.createElement("div");
  head.className = "reference-head";
  const title = document.createElement("span");
  title.textContent = "当前图片参考图";
  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.className = "button reference-add";
  addBtn.textContent = "添加参考图";
  addBtn.addEventListener("click", () => chooseReferenceImages(item.id));
  head.append(title, addBtn);

  const grid = document.createElement("div");
  grid.className = "reference-grid";
  grid.dataset.referenceItemId = item.id;
  if (!item.referenceImages?.length) {
    const empty = document.createElement("div");
    empty.className = "reference-empty";
    empty.textContent = "可为当前图片单独添加参考图，粘贴图片到此区域也可添加";
    grid.appendChild(empty);
  } else {
    for (const reference of item.referenceImages) {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "reference-card";
      card.title = reference.name;
      const image = document.createElement("img");
      image.src = reference.url;
      image.alt = reference.name;
      const remove = document.createElement("span");
      remove.className = "reference-remove";
      remove.textContent = "×";
      remove.addEventListener("click", event => {
        event.stopPropagation();
        item.referenceImages = item.referenceImages.filter(value => value.id !== reference.id);
        renderList();
      });
      card.addEventListener("click", () => openProductPreview(reference.url));
      card.append(image, remove);
      grid.appendChild(card);
    }
  }

  const ratioRow = document.createElement("label");
  ratioRow.className = "template-ratio-row";
  const ratioLabel = document.createElement("span");
  ratioLabel.textContent = "尺寸比例";
  const ratioSelect = document.createElement("select");
  ratioSelect.className = "input template-ratio-select";
  for (const option of TEMPLATE_ASPECT_OPTIONS) {
    const optionElement = document.createElement("option");
    optionElement.value = option.value;
    optionElement.textContent = option.label;
    ratioSelect.appendChild(optionElement);
  }
  ratioSelect.value = item.templateAspectRatio || "auto";
  ratioSelect.addEventListener("change", () => {
    item.templateAspectRatio = ratioSelect.value;
    item.templateStatus = "pending";
    item.templatePath = "";
    item.templateUrl = "";
    item.templateError = "";
    renderList();
    showToast(ratioSelect.value === "auto" ? "已恢复自动匹配比例" : `已设置生成比例 ${ratioSelect.value}`);
  });
  ratioRow.append(ratioLabel, ratioSelect);

  block.append(head, grid, ratioRow);
  return block;
}

function scheduleRenderPreview(delay = 180) {
  clearTimeout(state.previewRenderTimer);
  state.previewRenderTimer = setTimeout(() => {
    state.previewRenderTimer = 0;
    renderPreview();
  }, delay);
}

function renderPreviewNow() {
  clearTimeout(state.previewRenderTimer);
  if (state.previewAnimationFrame) cancelAnimationFrame(state.previewAnimationFrame);
  state.previewAnimationFrame = requestAnimationFrame(() => {
    state.previewAnimationFrame = 0;
    renderPreview();
  });
}

function renderAll() {
  syncInputs();
  updateApiStatus();
  if (state.layerMode) renderPreviewNow();
  else scheduleRenderPreview();
  renderList();
  renderRiskPanel();
}

function renderSideOnly() {
  syncInputs();
  updateApiStatus();
  renderList();
  renderRiskPanel();
}

function renderLedgerPage() {
  refs.ledgerList.innerHTML = "";
  if (!state.costLedger.length) {
    const empty = document.createElement("div");
    empty.className = "ledger-empty";
    empty.textContent = "暂无费用记录";
    refs.ledgerList.appendChild(empty);
    return;
  }
  for (const entry of state.costLedger) {
    const row = document.createElement("div");
    row.className = `ledger-row${entry.type === "prompt" ? " prompt-ledger-row" : ""}`;
    const main = document.createElement("div");
    main.className = "ledger-main";
    const meta = document.createElement("div");
    meta.className = "ledger-meta";
    meta.textContent = formatLedgerTime(entry.timestamp);
    const title = document.createElement("div");
    title.className = "ledger-cost";
    title.textContent = ledgerCostText(entry);
    const sub = document.createElement("div");
    sub.className = "ledger-sub";
    sub.textContent = [entry.type === "prompt" ? "提示词" : "生图", entry.model, entry.itemName].filter(Boolean).join(" · ");
    main.append(meta, title, sub);
    const preview = document.createElement("div");
    preview.className = entry.type === "prompt" ? "ledger-text-preview" : "ledger-thumb";
    if (entry.type === "prompt") {
      preview.textContent = entry.resultPreview || "无提示词结果";
    } else if (entry.thumbnail) {
      const image = document.createElement("img");
      image.src = entry.thumbnail;
      image.alt = entry.itemName || "生成结果";
      preview.appendChild(image);
    }
    row.append(main, preview);
    refs.ledgerList.appendChild(row);
  }
}

function ledgerCostText(entry) {
  const summary = String(entry.costSummary || "").trim();
  if (summary && !/^用量[:：]/.test(summary)) return summary;
  const usage = String(entry.usageSummary || summary.replace(/^用量[:：]\s*/, "")).trim();
  if (usage) return `费用：接口未返回费用，仅记录用量：${usage}`;
  return "费用：接口未返回费用或用量，无法估算";
}

function exitLedgerMode() {
  if (!state.ledgerMode) return;
  state.ledgerMode = false;
  renderAll();
}

function toggleLedgerMode() {
  state.ledgerMode = !state.ledgerMode;
  if (state.ledgerMode) {
    closeSettings();
    closeRiskModal();
    closePromptTemplateModal();
    closeProductModal();
    closeProductPreview();
    closeConfirmModal();
    state.layerMode = false;
  }
  renderAll();
}

function formatRiskResult(item) {
  const matches = item.riskMatches || [];
  const chips = matches.length
    ? matches.map(match => `<span class="risk-chip">${escapeHtml(match.category)}：${escapeHtml(match.word)}</span>`).join("")
    : `<span class="safe-text">未发现风险词</span>`;
  return `
    <div class="risk-result-count">命中风险词：${matches.length}</div>
    <div class="risk-chip-row">${chips}</div>
    <div class="risk-ocr-title">OCR 识别文案</div>
    <div class="risk-ocr-text">${highlightRiskText(item.riskText, matches)}</div>
    <div class="risk-note-inline">排查结果仅供参考，请以平台规则和人工审核为准。</div>
  `;
}

function renderRiskPanel() {
  const checked = state.items.filter(item => item.riskStatus === "done" || item.riskStatus === "failed");
  const risky = state.items.filter(item => item.riskMatches.length);
  const total = risky.reduce((sum, item) => sum + item.riskMatches.length, 0);
  refs.riskSummaryBadge.textContent = String(total);

  if (!state.items.length) {
    refs.riskSummary.textContent = "排查结果仅供参考，请以平台规则和人工审核为准。";
    return;
  }
  if (!checked.length) {
    refs.riskSummary.textContent = "尚未排查。排查结果仅供参考，请以平台规则和人工审核为准。";
    return;
  }
  if (!risky.length) {
    refs.riskSummary.textContent = "未发现风险词。排查结果仅供参考，请以平台规则和人工审核为准。";
    return;
  }

  refs.riskSummary.innerHTML = risky.map(item => {
    const matches = item.riskMatches || [];
    const words = matches.map(match => `${match.word} (${match.category})`).join(", ");
    return `<button type="button" class="risk-summary-item has-risk" data-id="${item.id}"><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(words)}</span></button>`;
  }).join("");
}

function scrollToImage(itemId) {
  const target = refs.previewCanvas.querySelector(`[data-id="${itemId}"]`);
  if (target) {
    refs.previewWrap.scrollTo({
      top: target.offsetTop - 8,
      behavior: "smooth"
    });
  }
}

function scrollListToImage(itemId) {
  if (!itemId) return;
  const target = refs.imageList.querySelector(`[data-id="${itemId}"]`);
  if (target) {
    target.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }
}

function updateListSelectionClasses() {
  refs.imageList.querySelectorAll(".list-item").forEach(element => {
    element.classList.toggle("selected", state.selectedIds.has(element.dataset.id));
  });
}

function selectImageFromPreview(itemId) {
  state.selectedIds = new Set([itemId]);
  syncLayerPanelsForSelection();
  renderList();
  requestAnimationFrame(() => scrollListToImage(itemId));
}

function syncSelectionFromPreviewScroll() {
  if (state.layerMode) return;
  if (!state.items.length) return;
  const panelTop = refs.previewWrap.scrollTop;
  const frames = Array.from(refs.previewCanvas.querySelectorAll(state.templateMode ? ".template-reference" : ".preview-frame"));
  let currentId = state.items[0].id;
  for (const frame of frames) {
    if (frame.offsetTop - panelTop <= 96) {
      currentId = frame.dataset.id;
    } else {
      break;
    }
  }
  if (currentId && !state.selectedIds.has(currentId)) {
    state.selectedIds = new Set([currentId]);
    renderList();
  }
}

function handleRowClick(itemId, event) {
  if (isEditableTarget(event.target)) return;
  const multi = event.shiftKey;
  if (multi) {
    if (state.selectedIds.has(itemId)) {
      state.selectedIds.delete(itemId);
    } else {
      state.selectedIds.add(itemId);
    }
  } else {
    state.selectedIds = new Set([itemId]);
    scrollToImage(itemId);
  }
  syncLayerPanelsForSelection();
  if (state.layerMode) {
    if (!updateLayerStageSelection()) renderAll();
    else {
      updateListSelectionClasses();
      scheduleLayerSideSync(itemId);
    }
  } else {
    renderList();
  }
  requestAnimationFrame(() => scrollListToImage(itemId));
}

function startLayerMove(itemId, event, displayScale) {
  if (!state.layerMode || event.button !== 0 || event.target.classList.contains("layer-resize-handle")) return;
  if (event.detail >= 2) return;
  const layerElement = event.currentTarget;
  const item = state.items.find(value => value.id === itemId);
  if (!item) return;
  if (item.type === "text" && state.activeTool === "text" && !event.ctrlKey && !event.metaKey) {
    if (layerElement.querySelector(".layer-text-preview")?.isContentEditable) {
      event.stopPropagation();
      return;
    }
    event.stopPropagation();
    event.preventDefault();
    startInlineTextEdit(itemId, layerElement);
    return;
  }
  if (state.activeTool !== "move" && !event.ctrlKey && !event.metaKey) return;
  event.stopPropagation();
  event.preventDefault();
  if (event.shiftKey) {
    if (state.selectedIds.has(itemId)) state.selectedIds.delete(itemId);
    else state.selectedIds.add(itemId);
    state.suppressNextLayerClick = true;
    syncLayerPanelsForSelection();
    if (!updateLayerStageSelection()) renderAll();
    else {
      updateListSelectionClasses();
      scheduleLayerSideSync(itemId);
    }
    requestAnimationFrame(() => scrollListToImage(itemId));
    return;
  }
  if (!state.selectedIds.has(itemId)) {
    state.selectedIds = new Set([itemId]);
    syncLayerPanelsForSelection();
  }
  updateLayerStageSelection();
  updateListSelectionClasses();
  const movingItems = state.items.filter(value => state.selectedIds.has(value.id));
  const origins = new Map(movingItems.map(value => [value.id, { ...layerTransformFor(value) }]));
  const startX = event.clientX;
  const startY = event.clientY;
  const beforeMove = layerHistorySnapshot();
  let moved = false;
  const onMove = moveEvent => {
    moved = true;
    moveEvent.preventDefault();
    const rawDx = (moveEvent.clientX - startX) / displayScale;
    const rawDy = (moveEvent.clientY - startY) / displayScale;
    const activeOrigin = origins.get(itemId);
    const activeRect = {
      id: itemId,
      x: activeOrigin.x + rawDx,
      y: activeOrigin.y + rawDy,
      width: item.width * (activeOrigin.scaleX || activeOrigin.scale || 1),
      height: item.height * (activeOrigin.scaleY || activeOrigin.scale || 1)
    };
    const snap = getMoveSnapResult(activeRect, new Set(movingItems.map(value => value.id)));
    const dx = snap.x - activeOrigin.x;
    const dy = snap.y - activeOrigin.y;
    updateSnapGuides(snap.guides, displayScale);
    for (const movingItem of movingItems) {
      const origin = origins.get(movingItem.id);
      const transform = layerTransformFor(movingItem);
      transform.x = origin.x + dx;
      transform.y = origin.y + dy;
      movingItem.layerTransform = transform;
      const element = refs.previewCanvas.querySelector(`.layer-item[data-id="${movingItem.id}"]`);
      if (element) {
        element.style.left = `${transform.x * displayScale}px`;
        element.style.top = `${transform.y * displayScale}px`;
      }
    }
  };
  const onUp = upEvent => {
    document.removeEventListener("pointermove", onMove);
    document.removeEventListener("pointerup", onUp);
    document.removeEventListener("pointercancel", onUp);
    if (moved) {
      pushLayerHistorySnapshot(beforeMove);
      state.suppressNextLayerClick = true;
      state.suppressNextPreviewClear = true;
    }
    updateSnapGuides([], displayScale);
    if (moved) {
      if (!updateSelectedLayerElementPositions()) renderAll();
      else scheduleLayerSideSync(itemId);
    }
    upEvent.preventDefault();
  };
  document.addEventListener("pointermove", onMove);
  document.addEventListener("pointerup", onUp);
  document.addEventListener("pointercancel", onUp);
}

function startLayerResize(itemId, direction, event, displayScale) {
  if (!state.layerMode || event.button !== 0) return;
  event.stopPropagation();
  event.preventDefault();
  const item = state.items.find(value => value.id === itemId);
  if (!item) return;
  const layerElement = event.currentTarget.closest(".layer-item");
  state.selectedIds = new Set([itemId]);
  const transform = layerTransformFor(item);
  const layerRect = layerElement?.getBoundingClientRect();
  const centerScreenX = layerRect ? layerRect.left + layerRect.width / 2 : event.clientX;
  const centerScreenY = layerRect ? layerRect.top + layerRect.height / 2 : event.clientY;
  const origin = { ...transform };
  const originScaleX = origin.scaleX || origin.scale;
  const originScaleY = origin.scaleY || origin.scale;
  const originWidth = item.width * originScaleX;
  const originHeight = item.height * originScaleY;
  const centerX = origin.x + originWidth / 2;
  const centerY = origin.y + originHeight / 2;
  const originFontSize = Math.max(8, Number(item.textLayer?.fontSize) || 48);
  const startDistance = Math.max(12, Math.hypot(event.clientX - centerScreenX, event.clientY - centerScreenY));
  const originRight = origin.x + originWidth;
  const originBottom = origin.y + originHeight;
  const beforeResize = layerHistorySnapshot();
  let moved = false;
  const resizeBoxLayer = moveEvent => {
    const dx = (moveEvent.clientX - event.clientX) / displayScale;
    const dy = (moveEvent.clientY - event.clientY) / displayScale;
    let nextX = origin.x;
    let nextY = origin.y;
    let nextWidth = originWidth;
    let nextHeight = originHeight;
    if (direction.includes("e")) nextWidth = originWidth + dx;
    if (direction.includes("s")) nextHeight = originHeight + dy;
    if (direction.includes("w")) {
      nextWidth = originWidth - dx;
      nextX = origin.x + dx;
    }
    if (direction.includes("n")) {
      nextHeight = originHeight - dy;
      nextY = origin.y + dy;
    }
    nextWidth = Math.max(8, nextWidth);
    nextHeight = Math.max(8, nextHeight);
    if (direction.includes("w")) nextX = origin.x + originWidth - nextWidth;
    if (direction.includes("n")) nextY = origin.y + originHeight - nextHeight;
    const snapped = getResizeSnapResult(
      { id: item.id, x: nextX, y: nextY, width: nextWidth, height: nextHeight },
      direction,
      new Set([item.id])
    );
    nextX = snapped.x;
    nextY = snapped.y;
    nextWidth = snapped.width;
    nextHeight = snapped.height;
    updateSnapGuides(snapped.guides, displayScale);
    transform.x = nextX;
    transform.y = nextY;
    transform.scale = 1;
    transform.scaleX = 1;
    transform.scaleY = 1;
    item.width = Math.max(1, Math.round(nextWidth));
    item.height = Math.max(1, Math.round(nextHeight));
  };
  const onMove = moveEvent => {
    moved = true;
    moveEvent.preventDefault();
    if (item.type === "text" && item.textLayer?.boxFit) {
      resizeBoxLayer(moveEvent);
      syncTextLayerGeometry(item);
    } else if (item.type === "text") {
      const dx = (moveEvent.clientX - event.clientX) / displayScale;
      const dy = (moveEvent.clientY - event.clientY) / displayScale;
      let scaleFromWidth = 1;
      let scaleFromHeight = 1;
      if (direction.includes("e")) scaleFromWidth = Math.max(0.1, (originWidth + dx) / originWidth);
      if (direction.includes("w")) scaleFromWidth = Math.max(0.1, (originWidth - dx) / originWidth);
      if (direction.includes("s")) scaleFromHeight = Math.max(0.1, (originHeight + dy) / originHeight);
      if (direction.includes("n")) scaleFromHeight = Math.max(0.1, (originHeight - dy) / originHeight);
      const activeScales = [];
      if (direction.includes("e") || direction.includes("w")) activeScales.push(scaleFromWidth);
      if (direction.includes("n") || direction.includes("s")) activeScales.push(scaleFromHeight);
      const nextScale = Math.max(0.1, Math.min(20, activeScales.length ? Math.max(...activeScales) : 1));
      item.textLayer.fontSize = Math.max(8, Math.round(originFontSize * nextScale));
      transform.scale = 1;
      transform.scaleX = 1;
      transform.scaleY = 1;
      syncTextLayerGeometry(item);
      const nextWidth = item.width;
      const nextHeight = item.height;
      if (direction.includes("w")) transform.x = originRight - nextWidth;
      else if (direction.includes("e")) transform.x = origin.x;
      else transform.x = centerX - nextWidth / 2;
      if (direction.includes("n")) transform.y = originBottom - nextHeight;
      else if (direction.includes("s")) transform.y = origin.y;
      else transform.y = centerY - nextHeight / 2;
    } else if (item.type === "rect") {
      resizeBoxLayer(moveEvent);
    } else {
      const distance = Math.max(8, Math.hypot(moveEvent.clientX - centerScreenX, moveEvent.clientY - centerScreenY));
      const nextScale = Math.max(0.05, Math.min(20, origin.scale * distance / startDistance));
      transform.scale = nextScale;
      transform.scaleX = nextScale;
      transform.scaleY = nextScale;
      transform.x = centerX - item.width * nextScale / 2;
      transform.y = centerY - item.height * nextScale / 2;
    }
    item.layerTransform = transform;
    if (layerElement) {
      layerElement.style.left = `${transform.x * displayScale}px`;
      layerElement.style.top = `${transform.y * displayScale}px`;
      layerElement.style.width = `${item.width * (transform.scaleX || transform.scale) * displayScale}px`;
      layerElement.style.height = `${item.height * (transform.scaleY || transform.scale) * displayScale}px`;
      if (item.type === "text") {
        const textPreview = layerElement.querySelector(".layer-text-preview");
        if (textPreview) {
          textPreview.style.font = item.textLayer?.boxFit
            ? fontCssWithSize(item.textLayer, fittedBoxTextSize(item), displayScale)
            : fontCss(item.textLayer, displayScale);
          applyTextPreviewStroke(textPreview, item.textLayer, displayScale);
        }
      }
    }
  };
  const onUp = () => {
    document.removeEventListener("pointermove", onMove);
    document.removeEventListener("pointerup", onUp);
    document.removeEventListener("pointercancel", onUp);
    if (moved) pushLayerHistorySnapshot(beforeResize);
    updateSnapGuides([], displayScale);
    if (item.type === "text" || item.type === "rect") saveGraphicItemImage(item).catch(() => {});
    renderAll();
  };
  document.addEventListener("pointermove", onMove);
  document.addEventListener("pointerup", onUp);
  document.addEventListener("pointercancel", onUp);
}

function setListActionMode(mode, force = false) {
  if (!force && mode === state.listActionMode) return;
  state.listActionMode = mode;
  if (mode === "prompt" || mode === "risk") {
    state.batchReplaceMode = false;
    state.layerMode = false;
    refs.batchReplaceBtn?.classList.remove("active");
    refs.layerTemplateBtn?.classList.remove("active");
  }
  for (const item of state.items) {
    if (mode !== "prompt") item.isPromptExpanded = false;
    if (mode !== "risk") item.isRiskExpanded = false;
    if (mode !== "replace") item.isReplacementExpanded = false;
    if (mode === "prompt" || mode === "risk") {
      const padding = sidePaddingFor(item);
      padding.expanded = false;
      item.sidePadding = padding;
    }
  }
}

function exitLayerModeSilently() {
  if (!state.layerMode) return false;
  state.layerMode = false;
  state.listActionMode = "";
  for (const item of state.items) {
    item.isReplacementExpanded = false;
  }
  return true;
}

function togglePromptExpansion(itemId) {
  const target = state.items.find(item => item.id === itemId);
  const willOpen = Boolean(target && !target.isPromptExpanded);
  for (const item of state.items) {
    item.isPromptExpanded = item.id === itemId ? willOpen : false;
    item.isRiskExpanded = false;
    const padding = sidePaddingFor(item);
    padding.expanded = false;
    item.sidePadding = padding;
  }
  renderList();
}

function stopPrompt(itemId, markStopped = true) {
  const controller = state.promptControllers.get(itemId);
  if (controller) {
    controller.abort();
    state.promptControllers.delete(itemId);
  }
  const item = state.items.find(value => value.id === itemId);
  if (item && markStopped) {
    item.promptStatus = "stopped";
    item.promptProgress = 0;
    item.isPromptExpanded = false;
  }
}

function stopAllPrompts() {
  for (const itemId of state.promptControllers.keys()) {
    stopPrompt(itemId, true);
  }
  state.batchQueue = [];
  for (const item of state.items) {
    if (item.promptStatus === "queued") {
      item.promptStatus = "pending";
      item.promptProgress = 0;
    }
  }
  renderSideOnly();
}

function handlePromptButton(itemId) {
  const item = state.items.find(value => value.id === itemId);
  if (!item) return;
  if (item.promptStatus === "done") {
    togglePromptExpansion(itemId);
    return;
  }
  if (item.promptStatus === "generating") {
    stopPrompt(itemId, true);
    renderSideOnly();
    return;
  }
  if (item.promptStatus === "queued") {
    item.promptStatus = "pending";
    state.batchQueue = state.batchQueue.filter(id => id !== itemId);
    renderSideOnly();
    return;
  }
  startPromptGeneration(itemId, item.promptStatus === "failed");
}

function toggleRiskExpansion(itemId) {
  const target = state.items.find(item => item.id === itemId);
  const willOpen = Boolean(target && !target.isRiskExpanded);
  for (const item of state.items) {
    item.isPromptExpanded = false;
    item.isRiskExpanded = item.id === itemId ? willOpen : false;
    const padding = sidePaddingFor(item);
    padding.expanded = false;
    item.sidePadding = padding;
  }
  renderList();
}

function toggleSidePaddingPanel(itemId) {
  const target = state.items.find(item => item.id === itemId);
  const willOpen = Boolean(target && !sidePaddingFor(target).expanded);
  for (const item of state.items) {
    const padding = sidePaddingFor(item);
    padding.expanded = item.id === itemId ? willOpen : false;
    item.isPromptExpanded = false;
    item.isRiskExpanded = false;
    item.sidePadding = padding;
  }
  renderList();
}

function toggleReplacementPanel(itemId) {
  const target = state.items.find(item => item.id === itemId);
  const willOpen = Boolean(target && !target.isReplacementExpanded);
  for (const item of state.items) {
    item.isPromptExpanded = false;
    item.isRiskExpanded = false;
    item.isReplacementExpanded = item.id === itemId ? willOpen : false;
    if (willOpen) item.graphicPropertiesExpanded = false;
    const padding = sidePaddingFor(item);
    padding.expanded = false;
    item.sidePadding = padding;
  }
  renderSideOnly();
}

function applyBatchReplaceMode(enabled) {
  state.batchReplaceMode = enabled;
  if (state.batchReplaceMode) {
    state.layerMode = false;
    clearLayerReplacementPreview();
  }
  state.listActionMode = state.batchReplaceMode ? "replace" : "";
  for (const item of state.items) {
    item.isPromptExpanded = false;
    item.isRiskExpanded = false;
    if (!state.batchReplaceMode) item.isReplacementExpanded = false;
    const padding = sidePaddingFor(item);
    padding.expanded = false;
    item.sidePadding = padding;
  }
  renderAll();
}

function applyLayerTemplateMode(enabled) {
  state.layerMode = enabled;
  if (state.layerMode) {
    state.batchReplaceMode = false;
    state.listActionMode = "replace";
    state.layerHistory = [];
    state.shapeDraft = null;
    state.selectionDraft = null;
    state.snapGuides = [];
    ensureLayerBounds(true);
  } else {
    state.listActionMode = "";
    state.snapGuides = [];
    clearLayerReplacementPreview();
  }
  for (const item of state.items) {
    item.isPromptExpanded = false;
    item.isRiskExpanded = false;
    item.isReplacementExpanded = state.layerMode ? true : false;
    const padding = sidePaddingFor(item);
    padding.expanded = false;
    item.sidePadding = padding;
  }
  renderAll();
}

function confirmExitTemplateThen(action) {
  if (!state.templateMode) {
    action();
    return;
  }
  openConfirm("退出套版？", "是否确认退出？将删除所有生成的套版图。", "确认", () => {
    clearTemplateResults();
    action();
  });
}

function toggleBatchReplaceMode() {
  const enabled = !state.batchReplaceMode;
  if (state.templateMode) {
    confirmExitTemplateThen(() => applyBatchReplaceMode(true));
    return;
  }
  applyBatchReplaceMode(enabled);
}

function toggleLayerTemplateMode() {
  const enabled = !state.layerMode;
  if (state.templateMode) {
    confirmExitTemplateThen(() => applyLayerTemplateMode(true));
    return;
  }
  applyLayerTemplateMode(enabled);
}

function handleRiskButton(itemId) {
  const item = state.items.find(value => value.id === itemId);
  if (!item || item.riskStatus === "checking") return;
  if (item.riskStatus === "done") {
    toggleRiskExpansion(itemId);
    return;
  }
  startRiskCheck(itemId);
}

async function startRiskCheck(itemId) {
  const item = state.items.find(value => value.id === itemId);
  if (!item) return;
  item.riskStatus = "checking";
  item.riskError = "";
  item.isRiskExpanded = false;
  renderSideOnly();

  try {
    const riskApi = getRiskApiConfig();
    const riskText = isCompleteApiConfig(riskApi)
      ? await invoke("generate_prompt", {
          path: item.path,
          api: riskApi,
          instruction: "OCR only. Return visible text line by line. Do not explain, add coordinates, markdown, JSON, or invented text."
        })
      : (await invoke("ocr_image_text", { path: item.path })).text;
    item.riskText = cleanOcrText(riskText);
    item.riskMatches = matchRiskWords(item.riskText);
    item.riskStatus = "done";
    if (item.riskMatches.length) {
      for (const other of state.items) {
        other.isPromptExpanded = false;
        other.isRiskExpanded = false;
        const padding = sidePaddingFor(other);
        padding.expanded = false;
        other.sidePadding = padding;
      }
    }
    item.isRiskExpanded = item.riskMatches.length > 0;
  } catch (error) {
    item.riskStatus = "failed";
    item.riskError = `OCR 识别失败：${readableOcrError(error)}`;
    item.riskMatches = [];
    item.isRiskExpanded = true;
  } finally {
    renderSideOnly();
  }
}

async function checkAllRisks() {
  if (!state.items.length) return;
  setListActionMode("risk", true);
  renderSideOnly();
  if (state.riskBatchRunning) return;
  state.riskBatchRunning = true;
  setStatus("正在排查风险词，请稍候...");
  renderSideOnly();
  for (const item of state.items) {
    await startRiskCheck(item.id);
  }
  state.riskBatchRunning = false;
  setStatus("排查完成");
  renderSideOnly();
  showToast("排查完成");
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }
}

function isTextEditingTarget(target) {
  return Boolean(target?.closest?.("input, textarea, select, [contenteditable='true']"));
}

function expandedPromptItemId() {
  return state.items.find(item => item.isPromptExpanded)?.id || "";
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function extensionFromMime(type) {
  switch (String(type || "").toLowerCase()) {
    case "image/jpeg":
      return "jpg";
    case "image/webp":
      return "webp";
    case "image/bmp":
      return "bmp";
    case "image/tiff":
      return "tiff";
    default:
      return "png";
  }
}

async function handlePaste(event) {
  const items = Array.from(event.clipboardData?.items || []);
  const imageItems = items.filter(item => item.type.startsWith("image/"));
  if (isTextEditingTarget(event.target) && !imageItems.length) return;
  if (!imageItems.length) return;
  event.preventDefault();
  try {
    setStatus("正在添加粘贴图片...");
    const paths = [];
    for (const item of imageItems) {
      const file = item.getAsFile();
      if (!file) continue;
      const dataBase64 = arrayBufferToBase64(await file.arrayBuffer());
      const path = await invoke("save_pasted_image", {
        dataBase64,
        extension: extensionFromMime(file.type)
      });
      paths.push(path);
    }
    const replacementItemId = state.items.find(item => item.isReplacementExpanded && item.type !== "text")?.id || "";
    const promptItemId = event.target?.closest?.(".prompt-body") ? expandedPromptItemId() : "";
    if (promptItemId) {
      await importReferencePaths(promptItemId, paths);
    } else if (replacementItemId) {
      await importReplacementPaths(replacementItemId, paths);
    } else if (refs.productModal.classList.contains("show")) {
      await importProductPaths(paths);
    } else {
      await importPaths(paths);
    }
    setStatus("");
    if (paths.length) showToast("已添加粘贴图片");
  } catch (error) {
    setStatus("");
    showToast(`粘贴图片失败：${error.message || error}`);
  }
}

function unifiedTemplatePrompt(item) {
  return [
    "Current image basic information:",
    "File name: " + item.name,
    "Size: " + item.width + " x " + item.height + "px",
    "Ratio: " + ratioText(item.width, item.height),
    "Orientation: " + orientationText(item.width, item.height),
    "Format: " + item.format,
    "Color mode: " + item.color_mode,
    "Please describe the image in detail for ecommerce design migration."
  ].join("\n");
}

function getPromptApiConfig() {
  return state.config.prompt_api || normalizeApiConfig(null, DEFAULT_PROMPT_API);
}

function getRiskApiConfig() {
  return state.config.risk_api || normalizeApiConfig(null, DEFAULT_RISK_API);
}

function getImageApiConfig() {
  const config = state.config.image_api || normalizeApiConfig(null, DEFAULT_IMAGE_API);
  if ((config.provider === "OpenAI" || /openai|api\.openai\.com|easyrouter\.io/i.test(`${config.provider || ""} ${config.base_url || ""}`)) && !String(config.model || "").trim()) {
    return { ...config, model: PROVIDERS.OpenAI.imageModel };
  }
  return config;
}

function loadCostLedger() {
  try {
    const raw = localStorage.getItem(COST_LEDGER_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    state.costLedger = Array.isArray(parsed) ? parsed.slice(0, 200) : [];
  } catch {
    state.costLedger = [];
  }
}

function saveCostLedger() {
  try {
    localStorage.setItem(COST_LEDGER_STORAGE_KEY, JSON.stringify(state.costLedger.slice(0, 200)));
  } catch {
    // 台账写入失败不应影响生图主流程。
  }
}

function formatLedgerTime(timestamp) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "";
  const pad = value => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function createLedgerThumbnail(dataUrl) {
  return new Promise(resolve => {
    const image = new Image();
    image.onload = () => {
      const size = 96;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const context = canvas.getContext("2d");
      if (!context) {
        resolve(dataUrl);
        return;
      }
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, size, size);
      const scale = Math.min(size / image.width, size / image.height);
      const width = Math.max(1, Math.round(image.width * scale));
      const height = Math.max(1, Math.round(image.height * scale));
      context.drawImage(image, Math.round((size - width) / 2), Math.round((size - height) / 2), width, height);
      resolve(canvas.toDataURL("image/jpeg", 0.78));
    };
    image.onerror = () => resolve("");
    image.src = dataUrl;
  });
}

async function addCostLedgerEntry(item, generationResult, imageUrl, api) {
  const summary = generationResult?.costSummary || "";
  const amount = Number(generationResult?.costAmount);
  const hasAmount = Number.isFinite(amount);
  const thumbnail = await createLedgerThumbnail(imageUrl);
  state.costLedger.unshift({
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    type: "image",
    timestamp: Date.now(),
    itemName: item?.name || "",
    model: api?.model || "",
    provider: api?.provider || "",
    costSummary: summary || "费用：接口未返回费用或用量，无法估算",
    costAmount: hasAmount ? amount : null,
    costCurrency: generationResult?.costCurrency || "",
    usageSummary: generationResult?.usageSummary || "",
    thumbnail,
    resultPreview: ""
  });
  state.costLedger = state.costLedger.slice(0, 200);
  saveCostLedger();
}

function addPromptCostLedgerEntry(item, promptResult, api, text) {
  const summary = promptResult?.costSummary || "";
  const amount = Number(promptResult?.costAmount);
  const hasAmount = Number.isFinite(amount);
  state.costLedger.unshift({
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    type: "prompt",
    timestamp: Date.now(),
    itemName: item?.name || "",
    model: api?.model || "",
    provider: api?.provider || "",
    costSummary: summary || "费用：接口未返回费用或用量，无法估算",
    costAmount: hasAmount ? amount : null,
    costCurrency: promptResult?.costCurrency || "",
    usageSummary: promptResult?.usageSummary || "",
    thumbnail: "",
    resultPreview: String(text || "").trim().slice(0, 50)
  });
  state.costLedger = state.costLedger.slice(0, 200);
  saveCostLedger();
}

function throwIfAborted(signal) {
  if (signal?.aborted) {
    throw new DOMException("aborted", "AbortError");
  }
}

function timeoutErrorMessage() {
  return "调用接口超过 300 秒仍未成功，已终止任务。";
}

function withApiTimeout(promise, signal) {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error(timeoutErrorMessage()));
    }, API_TASK_TIMEOUT_MS);
    const abortHandler = () => {
      clearTimeout(timer);
      reject(new DOMException("aborted", "AbortError"));
    };
    signal?.addEventListener?.("abort", abortHandler, { once: true });
    promise.then(
      value => {
        clearTimeout(timer);
        signal?.removeEventListener?.("abort", abortHandler);
        resolve(value);
      },
      error => {
        clearTimeout(timer);
        signal?.removeEventListener?.("abort", abortHandler);
        reject(error);
      }
    );
  });
}

async function testApiConnection(config, kind) {
  if (!config.api_key) {
    const name = kind === "image" ? "image" : kind === "risk" ? "risk" : "prompt";
    showToast("Missing " + name + " API Key");
    return;
  }
  if (kind !== "image" && /^(gpt-image-|dall-e-)/i.test(config.model || "")) {
    showToast("提示词/OCR API 不能使用出图模型，请改用 gpt-4o、gpt-4o-mini、gpt-4.1 或 gpt-5.4。");
    return;
  }
  const button = kind === "image" ? refs.testImageApiBtn : kind === "risk" ? refs.testRiskApiBtn : refs.testPromptApiBtn;
  const defaultText = kind === "image" ? "测试生图 API" : kind === "risk" ? "测试极限词 API" : "测试提示词 API";
  button.disabled = true;
  button.textContent = "测试中...";
  try {
    await invoke(kind === "image" ? "test_image_api_connection" : "test_api_connection", { api: config });
    const name = kind === "image" ? "image" : kind === "risk" ? "risk" : "prompt";
    showToast(name + " API connected");
  } catch (error) {
    showToast("连接失败：" + (error.message || error));
  } finally {
    button.disabled = false;
    button.textContent = defaultText;
  }
}

async function requestPromptFromApi(item, config, signal, onProgress) {
  onProgress(15);
  await sleep(80);
  throwIfAborted(signal);
  onProgress(40);
  const promptResult = await withApiTimeout(invoke("generate_prompt", {
    path: item.path,
    api: config,
    instruction: promptExtractionInstruction()
  }), signal);
  const rawText = typeof promptResult === "string" ? promptResult : promptResult?.text;
  const text = cleanGeneratedPromptText(rawText) || rawText || "";
  if (typeof promptResult === "object") {
    addPromptCostLedgerEntry(item, promptResult, config, text);
  }
  throwIfAborted(signal);
  onProgress(90);
  await sleep(80);
  throwIfAborted(signal);
  onProgress(100);
  return text;
}

async function startPromptGeneration(itemId, regenerate = false) {
  const item = state.items.find(value => value.id === itemId);
  if (!item || state.promptControllers.has(itemId)) return;

  if (regenerate) {
    item.promptText = "";
  }
  item.promptStatus = "generating";
  item.promptError = "";
  item.promptProgress = 0;
  item.isPromptExpanded = false;
  renderList();

  const controller = new AbortController();
  state.promptControllers.set(itemId, controller);
  const onProgress = progress => {
    item.promptStatus = "generating";
    item.promptProgress = Math.max(0, Math.min(100, progress));
    renderList();
  };

  try {
    const api = getPromptApiConfig();
    let text = "";
    if (!isCompleteApiConfig(api)) {
      onProgress(20);
      await sleep(120);
      throwIfAborted(controller.signal);
      onProgress(80);
      await sleep(120);
      throwIfAborted(controller.signal);
      text = promptExtractionInstruction() + "\n\n" + unifiedTemplatePrompt(item);
      onProgress(100);
    } else {
      text = await requestPromptFromApi(item, api, controller.signal, onProgress);
    }

    for (const other of state.items) {
      other.isPromptExpanded = false;
    }
    item.promptStatus = "done";
    item.promptText = text;
    item.promptProgress = 100;
    item.isPromptExpanded = true;
  } catch (error) {
    if (error?.name === "AbortError") {
      item.promptStatus = "stopped";
      item.promptProgress = 0;
      item.isPromptExpanded = false;
    } else {
      item.promptStatus = "failed";
      item.promptError = "提示词生成失败，点击重试\n" + readableApiError(error);
      item.promptProgress = 0;
      item.isPromptExpanded = true;
    }
  } finally {
    state.promptControllers.delete(itemId);
    processNextBatchPrompt();
    renderSideOnly();
  }
}

function processNextBatchPrompt() {
  if (state.promptControllers.size) return;
  const nextId = state.batchQueue.shift();
  if (!nextId) return;
  const item = state.items.find(value => value.id === nextId);
  if (!item) {
    processNextBatchPrompt();
    return;
  }
  startPromptGeneration(nextId, item.promptStatus === "failed");
}

function startPromptExtractionForTemplate() {
  const pending = state.items.filter(item => !["done", "generating", "queued"].includes(item.promptStatus));
  for (const item of pending) {
    item.promptStatus = "queued";
    item.promptProgress = 0;
    item.isPromptExpanded = false;
    if (!state.batchQueue.includes(item.id)) state.batchQueue.push(item.id);
  }
  renderSideOnly();
  processNextBatchPrompt();
}

function openTemplateWorkflow() {
  if (!state.items.length) {
    showToast("请先添加原始图片");
    return;
  }
  startPromptExtractionForTemplate();
  openProductModal();
}

function shouldCopyOriginalForTemplate(item) {
  const text = String(item.promptText || "");
  return /no obvious product|no product|text only|background only|无需替换|没有产品/i.test(text);
}

function templateInputPaths(item) {
  const paths = [
    ...((item.referenceImages || []).map(reference => reference.path)),
    ...state.productImages.map(product => product.path)
  ];
  return Array.from(new Set(paths));
}

async function generateTemplateForItem(item, force = false) {
  if (!item) return;
  const inputPaths = templateInputPaths(item);
  if (!inputPaths.length) {
    showToast("请先上传需套版的产品图");
    return;
  }
  if (!force && shouldCopyOriginalForTemplate(item)) {
    item.templateStatus = "copied";
    item.templatePath = item.path;
    item.templateUrl = item.url;
    item.templateWidth = item.width;
    item.templateHeight = item.height;
    item.templateError = "";
    item.templateCostSummary = "";
    item.templateCopiedOriginal = true;
    renderAll();
    return;
  }
  const imageApi = getImageApiConfig();
  if (!imageApi.api_key) {
    item.templateStatus = "failed";
    item.templateError = "未配置生图 API，无法生成套版图片";
    showToast("未配置生图 API，无法生成套版图片");
    renderAll();
    return;
  }

  item.templateStatus = "generating";
  item.templateError = "";
  item.templateCostSummary = "";
  item.templateCopiedOriginal = false;
  renderAll();
  try {
    const generationResult = await withApiTimeout(invoke("generate_template_image", {
      originalPath: item.path,
      productPaths: inputPaths,
      prompt: [item.promptText || "", currentTemplateInstruction()].filter(Boolean).join("\n\n"),
      aspectOverride: item.templateAspectRatio || "auto",
      api: imageApi
    }));
    const path = typeof generationResult === "string" ? generationResult : generationResult?.path;
    if (!path) throw new Error("生图 API 未返回图片路径");
    item.templateCostSummary = typeof generationResult === "object" ? (generationResult.costSummary || "") : "";
    item.templatePath = path;
    item.templateUrl = await invoke("read_image_data_url", { path });
    if (typeof generationResult === "object") {
      await addCostLedgerEntry(item, generationResult, item.templateUrl, imageApi);
    }
    try {
      const resultInfo = await invoke("collect_image_entries", { paths: [path] });
      const entry = resultInfo.entries?.[0];
      item.templateWidth = entry?.width || item.width;
      item.templateHeight = entry?.height || item.height;
    } catch {
      item.templateWidth = item.width;
      item.templateHeight = item.height;
    }
    item.templateStatus = "done";
  } catch (error) {
    item.templateStatus = "failed";
    item.templateError = "生成失败：" + readableApiError(error);
  } finally {
    renderAll();
  }
}

async function startTemplateGeneration() {
  if (!state.productImages.length) {
    showToast("请先上传需套版的产品图");
    return;
  }
  const readyItems = state.items.filter(item => item.promptStatus === "done" && item.promptText);
  if (!readyItems.length) {
    showToast("请等待提示词提取完成");
    return;
  }
  if (!getImageApiConfig().api_key) {
    showToast("未配置生图 API，无法生成套版图片");
    return;
  }
  closeProductModal();
  state.templateMode = true;
  state.activeTool = "move";
  state.templateRunning = true;
  setStatus("正在生成套版图...");
  renderAll();
  for (const item of state.items) {
    if (item.promptStatus === "done" && item.promptText) {
      await generateTemplateForItem(item);
    } else {
      item.templateStatus = "failed";
      item.templateError = "提示词尚未提取完成";
      item.templateCostSummary = "";
    }
  }
  state.templateRunning = false;
  setStatus("套版生成完成");
  renderAll();
}

async function regenerateTemplateItem(itemId) {
  const item = state.items.find(value => value.id === itemId);
  if (!item) return;
  state.templateMode = true;
  await generateTemplateForItem(item, true);
}

function clearTemplateResults() {
  for (const item of state.items) {
    item.templateStatus = "pending";
    item.templatePath = "";
    item.templateUrl = "";
    item.templateWidth = 0;
    item.templateHeight = 0;
    item.templateError = "";
    item.templateCostSummary = "";
    item.templateCopiedOriginal = false;
  }
  state.templateMode = false;
  state.templateRunning = false;
  state.layerMode = false;
  state.activeTool = "move";
  state.layerBounds = { width: 0, height: 0 };
  state.listActionMode = "";
  renderAll();
}

function exitTemplateMode() {
  if (!state.templateMode) return;
  openConfirm("退出套版？", "是否确认退出？将删除所有生成的套版图。", "退出", clearTemplateResults);
}

function toggleGenerateAll() {
  setListActionMode("prompt", true);
  const running = state.promptControllers.size > 0 || state.batchQueue.length > 0;
  if (running) {
    renderSideOnly();
    return;
  }
  state.batchQueue = [];
  for (const item of state.items) {
    if (["pending", "failed", "stopped"].includes(item.promptStatus)) {
      item.promptStatus = "queued";
      item.promptProgress = 0;
      item.isPromptExpanded = false;
      state.batchQueue.push(item.id);
    }
  }
  renderAll();
  processNextBatchPrompt();
}

async function copyAllPrompts() {
  const doneItems = state.items.filter(item => item.promptStatus === "done" && item.promptText);
  if (doneItems.length < 2) {
    showToast("至少要有 2 张图片完成提示词生成后才能复制全部。");
    return;
  }
  const content = doneItems
    .map((item, index) => "【第" + (index + 1) + "张】文件名：" + item.name + "\n提示词：\n" + item.promptText)
    .join("\n\n");
  await copyText(content);
  showToast("已复制全部提示词");
}

function removeSelectedItems() {
  if (!state.selectedIds.size) return;
  if (state.layerMode) pushLayerHistory();
  for (const itemId of state.selectedIds) {
    stopPrompt(itemId, false);
    const item = state.items.find(value => value.id === itemId);
    revokeReplacementUrls(item);
  }
  state.items = state.items.filter(item => !state.selectedIds.has(item.id));
  state.pathSet = new Set(state.items.map(item => item.path));
  state.selectedIds.clear();
  if (!state.items.length) {
    state.batchQueue = [];
    state.previewZoom = 1;
  }
  renderAll();
}

function resetApp() {
  stopAllPrompts();
  for (const item of state.items) revokeReplacementUrls(item);
  state.items = [];
  state.pathSet = new Set();
  state.selectedIds.clear();
  state.previewZoom = 1;
  state.templateMode = false;
  state.templateRunning = false;
  renderAll();
}

function revokeReplacementUrls(item) {
  for (const replacement of item?.replacementItems || []) {
    if (replacement.previewUrl?.startsWith("blob:")) URL.revokeObjectURL(replacement.previewUrl);
  }
}

function clearImages() {
  if (!state.items.length) return;
  openConfirm("清除图片？", "是否清除当前所有图片？", "清除", resetApp);
}

async function importPaths(paths) {
  if (!paths?.length) return;
  try {
    const wasEmpty = !state.items.length;
    const insertIndex = longStitchInsertIndexAfterSelection();
    const result = await invoke("collect_image_entries", { paths });
    const newEntries = result.entries.filter(entry => !state.pathSet.has(entry.path));
    if (!newEntries.length) {
      if (result.ignored_count || result.failed_files.length) {
        showToast("存在不支持或读取失败的文件，已自动跳过。");
      }
      return;
    }

    const nextItems = newEntries.map(defaultPromptState);
    if (wasEmpty) {
      nextItems.sort((a, b) => naturalCompare(a.name, b.name));
    }

    await Promise.all(nextItems.map(async item => {
      try {
        item.url = await invoke("read_image_data_url", { path: item.path });
        item.loadStatus = "ready";
      } catch (error) {
        console.error("图片加载失败", item.path, error);
        item.loadStatus = "failed";
        item.loadError = "图片加载失败，请重新添加";
      }
    }));

    state.items.splice(insertIndex, 0, ...nextItems);
    for (const item of nextItems) {
      state.pathSet.add(item.path);
    }
    if (state.layerMode) ensureLayerBounds(false);
    if (nextItems.length) {
      state.selectedIds = new Set([nextItems[0].id]);
    } else if (!state.selectedIds.size && state.items[0]) {
      state.selectedIds = new Set([state.items[0].id]);
    }
    renderAll();

    const notices = [];
    if (result.ignored_count) notices.push("已忽略 " + result.ignored_count + " 个不支持的文件");
    if (result.failed_files.length) notices.push("读取失败：" + result.failed_files.join(", "));
    if (notices.length) showToast(notices.join("；"));
  } catch (error) {
    showToast("导入失败：" + (error.message || error));
  }
}

function imageInfoFromFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      resolve({
        path: `browser-file:${file.name}:${file.size}:${file.lastModified}`,
        name: file.name,
        width: image.naturalWidth || image.width || 1,
        height: image.naturalHeight || image.height || 1,
        format: (file.name.split(".").pop() || file.type.replace("image/", "") || "image").toUpperCase(),
        color_mode: file.type || "image",
        url,
        browserFile: true
      });
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(file.name));
    };
    image.src = url;
  });
}

async function importBrowserFiles(fileList) {
  const files = Array.from(fileList || []).filter(file => {
    const extension = (file.name.split(".").pop() || "").toLowerCase();
    return SUPPORTED_EXTENSIONS.has(extension) || file.type.startsWith("image/");
  });
  if (!files.length) {
    showToast("请选择 JPG、PNG、WEBP、BMP 或 TIFF 图片");
    return;
  }

  const wasEmpty = !state.items.length;
  const insertIndex = longStitchInsertIndexAfterSelection();
  const entries = [];
  let failedCount = 0;
  for (const file of files) {
    try {
      const entry = await imageInfoFromFile(file);
      if (!state.pathSet.has(entry.path)) entries.push(entry);
    } catch {
      failedCount += 1;
    }
  }
  if (!entries.length) {
    showToast(failedCount ? "图片读取失败，请重新选择" : "图片已存在");
    return;
  }

  const nextItems = entries.map(entry => {
    const item = defaultPromptState(entry);
    item.url = entry.url;
    item.loadStatus = "ready";
    item.browserFile = true;
    return item;
  });
  if (wasEmpty) {
    nextItems.sort((a, b) => naturalCompare(a.name, b.name));
  }
  state.items.splice(insertIndex, 0, ...nextItems);
  for (const item of nextItems) state.pathSet.add(item.path);
  if (state.layerMode) ensureLayerBounds(false);
  state.selectedIds = new Set([nextItems[0].id]);
  renderAll();
  if (failedCount) showToast(`已添加 ${nextItems.length} 张图片，${failedCount} 张读取失败`);
}

function saveProductImages() {
  localStorage.setItem(PRODUCT_IMAGES_STORAGE_KEY, JSON.stringify(state.productImages.map(item => item.path)));
}

async function loadProductImages() {
  try {
    const paths = JSON.parse(localStorage.getItem(PRODUCT_IMAGES_STORAGE_KEY) || "[]");
    if (Array.isArray(paths) && paths.length) {
      await importProductPaths(paths, false);
    }
  } catch {
    // ignore saved product images when the stored value is invalid
  }
}

async function importProductPaths(paths, persist = true) {
  if (!paths?.length) return;
  try {
    const result = await invoke("collect_image_entries", { paths });
    const entries = result.entries.filter(entry => !state.productPathSet.has(entry.path));
    for (const entry of entries) {
      const product = {
        id: crypto.randomUUID(),
        path: entry.path,
        name: entry.name,
        url: await invoke("read_image_data_url", { path: entry.path })
      };
      state.productImages.push(product);
      state.productPathSet.add(product.path);
    }
    if (persist) saveProductImages();
    renderProductGrid();
    syncInputs();
  } catch (error) {
    showToast(`产品图添加失败：${error.message || error}`);
  }
}

async function importReferencePaths(itemId, paths) {
  const item = state.items.find(value => value.id === itemId);
  if (!item || !paths?.length) return;
  try {
    const result = await invoke("collect_image_entries", { paths });
    const existing = new Set((item.referenceImages || []).map(value => value.path));
    const entries = result.entries.filter(entry => !existing.has(entry.path));
    if (!item.referenceImages) item.referenceImages = [];
    for (const entry of entries) {
      item.referenceImages.push({
        id: crypto.randomUUID(),
        path: entry.path,
        name: entry.name,
        url: await invoke("read_image_data_url", { path: entry.path })
      });
    }
    renderList();
    if (entries.length) showToast("已添加当前图片参考图");
  } catch (error) {
    showToast(`参考图添加失败：${error.message || error}`);
  }
}

function hasReplacementItems() {
  return state.items.some(item => item.type === "text" ? textReplacementCount(item) > 0 : item.replacementItems?.length);
}

function maxReplacementCount() {
  return state.items.reduce((max, item) => Math.max(max, item.type === "text" ? textReplacementCount(item) : (item.replacementItems?.length || 0)), 0);
}

function addReplacementEntries(itemId, entries) {
  const item = state.items.find(value => value.id === itemId);
  if (!item || !entries.length) return;
  if (!item.replacementItems) item.replacementItems = [];
  const existing = new Set(item.replacementItems.filter(value => value.type === "image").map(value => value.path || value.name));
  const next = entries
    .filter(entry => !existing.has(entry.path || entry.name))
    .map(entry => ({
      id: crypto.randomUUID(),
      type: "image",
      path: entry.path || "",
      name: entry.name || "替换图",
      previewUrl: entry.previewUrl || entry.url || "",
      width: entry.width || 0,
      height: entry.height || 0
    }))
    .sort((a, b) => naturalCompare(a.name || "", b.name || ""));
  item.replacementItems.push(...next);
  renderSideOnly();
}

async function importReplacementPaths(itemId, paths) {
  if (!paths?.length) return;
  const target = state.items.find(item => item.id === itemId);
  if (target?.type === "text") return;
  try {
    const result = await invoke("collect_image_entries", { paths });
    const entries = [];
    for (const entry of result.entries) {
      entries.push({
        ...entry,
        previewUrl: await invoke("read_image_data_url", { path: entry.path })
      });
    }
    addReplacementEntries(itemId, entries);
    if (result.ignored_count || result.failed_files.length) {
      showToast("部分替换图读取失败或格式不支持");
    }
  } catch (error) {
    showToast(`替换图添加失败：${error.message || error}`);
  }
}

async function importBrowserReplacementFiles(itemId, fileList) {
  const target = state.items.find(item => item.id === itemId);
  if (target?.type === "text") return;
  const files = Array.from(fileList || []).filter(file => {
    const extension = (file.name.split(".").pop() || "").toLowerCase();
    return SUPPORTED_EXTENSIONS.has(extension) || file.type.startsWith("image/");
  });
  const entries = [];
  for (const file of files) {
    try {
      const info = await imageInfoFromFile(file);
      let path = info.path;
      if (isTauri()) {
        const dataBase64 = arrayBufferToBase64(await file.arrayBuffer());
        path = await invoke("save_pasted_image", {
          dataBase64,
          extension: extensionFromMime(file.type || `image/${(file.name.split(".").pop() || "png").toLowerCase()}`)
        });
      }
      entries.push({
        path,
        name: info.name,
        width: info.width,
        height: info.height,
        previewUrl: info.url
      });
    } catch {
      // ignore unreadable browser preview files
    }
  }
  addReplacementEntries(itemId, entries);
}

async function chooseReplacementImages(itemId) {
  state.replacementImportTargetId = itemId;
  if (!isTauri()) {
    refs.replacementFileInput.value = "";
    refs.replacementFileInput.click();
    return;
  }
  const result = await open({
    multiple: true,
    directory: false,
    filters: [{ name: "Images", extensions: ["jpg", "jpeg", "png", "webp", "bmp", "tif", "tiff"] }]
  });
  const paths = Array.isArray(result) ? result : result ? [result] : [];
  await importReplacementPaths(itemId, paths);
}

function addReplacementPlaceholder(itemId) {
  const item = state.items.find(value => value.id === itemId);
  if (!item) return;
  if (item.type === "text") return;
  if (!item.replacementItems) item.replacementItems = [];
  item.replacementItems.push({ id: crypto.randomUUID(), type: "placeholder", name: "占位" });
  renderSideOnly();
}

function removeReplacementItem(itemId, replacementId) {
  const item = state.items.find(value => value.id === itemId);
  if (!item?.replacementItems) return;
  const removed = item.replacementItems.find(value => value.id === replacementId);
  if (removed?.previewUrl?.startsWith("blob:")) URL.revokeObjectURL(removed.previewUrl);
  item.replacementItems = item.replacementItems.filter(value => value.id !== replacementId);
  renderSideOnly();
}

function clearReplacementSortMarkers() {
  document.querySelectorAll(".replacement-card.dragging, .replacement-card.drag-over, .replacement-card.drag-before, .replacement-card.drag-after")
    .forEach(element => element.classList.remove("dragging", "drag-over", "drag-before", "drag-after"));
  document.body.classList.remove("is-replacement-sorting");
}

function startReplacementSort(itemId, sourceId, event) {
  if (event.button !== 0 || event.target.closest(".replacement-remove")) return;
  const sourceCard = event.currentTarget;
  const grid = sourceCard.closest(".replacement-grid");
  if (!grid) return;

  const startX = event.clientX;
  const startY = event.clientY;
  let moved = false;
  let targetId = "";
  let placement = "before";

  const updateTarget = moveEvent => {
    clearReplacementSortMarkers();
    sourceCard.classList.add("dragging");
    document.body.classList.add("is-replacement-sorting");
    const hit = document.elementFromPoint(moveEvent.clientX, moveEvent.clientY);
    const targetCard = hit?.closest?.(".replacement-card");
    if (!targetCard || !grid.contains(targetCard) || targetCard.dataset.id === sourceId) {
      targetId = "";
      return;
    }
    const rect = targetCard.getBoundingClientRect();
    targetId = targetCard.dataset.id || "";
    placement = moveEvent.clientX > rect.left + rect.width / 2 ? "after" : "before";
    targetCard.classList.add("drag-over", placement === "after" ? "drag-after" : "drag-before");
  };

  const onPointerMove = moveEvent => {
    const distance = Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY);
    if (!moved && distance < 5) return;
    moved = true;
    moveEvent.preventDefault();
    updateTarget(moveEvent);
  };

  const onPointerUp = upEvent => {
    document.removeEventListener("pointermove", onPointerMove);
    document.removeEventListener("pointerup", onPointerUp);
    document.removeEventListener("pointercancel", onPointerUp);
    if (moved) {
      sourceCard.dataset.dragMoved = "1";
      if (targetId) reorderReplacementItem(itemId, sourceId, targetId, placement);
      setTimeout(() => delete sourceCard.dataset.dragMoved, 0);
      upEvent.preventDefault();
    }
    clearReplacementSortMarkers();
  };

  document.addEventListener("pointermove", onPointerMove);
  document.addEventListener("pointerup", onPointerUp, { once: true });
  document.addEventListener("pointercancel", onPointerUp, { once: true });
}

function reorderReplacementItem(itemId, sourceId, targetId, placement = "before") {
  if (!sourceId || !targetId || sourceId === targetId) return;
  const item = state.items.find(value => value.id === itemId);
  if (!item?.replacementItems) return;
  const sourceIndex = item.replacementItems.findIndex(value => value.id === sourceId);
  const targetIndex = item.replacementItems.findIndex(value => value.id === targetId);
  if (sourceIndex < 0 || targetIndex < 0) return;
  const [moved] = item.replacementItems.splice(sourceIndex, 1);
  let nextIndex = targetIndex;
  if (sourceIndex < targetIndex) nextIndex -= 1;
  if (placement === "after") nextIndex += 1;
  item.replacementItems.splice(Math.max(0, Math.min(nextIndex, item.replacementItems.length)), 0, moved);
  renderSideOnly();
}

async function replacementPathsForRound(roundIndex) {
  const paths = [];
  for (const item of state.items) {
    if (isGraphicLayer(item)) {
      paths.push(await saveGraphicItemImage(item, roundIndex));
      continue;
    }
    const replacement = item.replacementItems?.[roundIndex];
    paths.push(replacement?.type === "image" && replacement.path ? replacement.path : item.path);
  }
  return paths;
}

async function refreshGraphicLayers(roundIndex = -1) {
  for (const item of state.items) {
    if (isGraphicLayer(item)) {
      clearTimeout(item.graphicRenderTimer);
      await saveGraphicItemImage(item, roundIndex);
    }
  }
}

async function persistedReplacementPath(replacement) {
  if (!replacement || replacement.type !== "image") return "";
  if (replacement.path && !/^browser-file:/.test(replacement.path)) return replacement.path;
  if (!isTauri() || !replacement.previewUrl) return replacement.path || "";
  try {
    const response = await fetch(replacement.previewUrl);
    const blob = await response.blob();
    const dataBase64 = arrayBufferToBase64(await blob.arrayBuffer());
    const path = await invoke("save_pasted_image", {
      dataBase64,
      extension: extensionFromMime(blob.type)
    });
    replacement.path = path;
    return path;
  } catch {
    return replacement.path || "";
  }
}

async function layeredExportPayload(roundIndex = -1) {
  const paths = [];
  const layerTransforms = [];
  for (const item of state.items) {
    if (isGraphicLayer(item)) {
      paths.push(await saveGraphicItemImage(item, roundIndex));
      layerTransforms.push(exportLayerTransform(item, 1));
      continue;
    }
    const replacement = roundIndex >= 0 ? item.replacementItems?.[roundIndex] : null;
    const replacementPath = await persistedReplacementPath(replacement);
    paths.push(replacementPath || item.path);
    const replacementWidth = Number(replacement?.type === "image" ? replacement.width : 0);
    const originalWidth = Number(item.width || 0);
    const scaleMultiplier = replacementPath && replacementWidth > 0 && originalWidth > 0
      ? originalWidth / replacementWidth
      : 1;
    layerTransforms.push(exportLayerTransform(item, scaleMultiplier));
  }
  const missingIndex = paths.findIndex(path => !path || /^browser-file:/.test(path));
  if (missingIndex >= 0) {
    const item = state.items[missingIndex];
    throw new Error(`第 ${missingIndex + 1} 个图层路径无效：${item?.name || "未命名图片"}`);
  }
  return {
    paths,
    layerTransforms,
    layerBlendModes: state.items.map(item => layerBlendModeFor(item))
  };
}

async function replacementExport() {
  const rounds = state.layerMode ? Math.max(1, maxReplacementCount()) : maxReplacementCount();
  if (!rounds) {
    showToast("请先添加替换图或占位图");
    return;
  }
  const baseDir = state.config.last_save_dir || (await pictureDir());
  const outputDir = await open({ directory: true, multiple: false, defaultPath: baseDir });
  if (!outputDir) return;
  let failed = 0;
  const errors = [];
  for (let index = 0; index < rounds; index += 1) {
    setStatus(`正在导出 ${index + 1} / ${rounds}`);
    const paths = await replacementPathsForRound(index);
    try {
      if (state.layerMode) {
        const bounds = ensureLayerBounds(false);
        const payload = await layeredExportPayload(index);
        await invoke("save_layered_image", {
          paths: payload.paths,
          layerTransforms: payload.layerTransforms,
          layerBlendModes: payload.layerBlendModes,
          backgroundColor: state.backgroundColor,
          outputWidth: bounds.width,
          outputHeight: bounds.height,
          outputPath: await join(outputDir, `产品_${index + 1}.png`)
        });
      } else if (state.exportMode === "slices") {
        await invoke("save_sliced_images", {
          paths,
          sidePaddings: state.items.map(exportSidePadding),
          spacing: state.spacing,
          spacingColor: state.spacingColor,
          spacingFillMode: state.spacingFillMode,
          spacingMicroShadowPercent: state.spacingMicroShadowPercent,
          backgroundColor: state.backgroundColor,
          outputWidth: state.exportWidth,
          outputDir: await join(outputDir, `产品_${index + 1}`)
        });
      } else {
        await invoke("save_stitched_image", {
          paths,
          sidePaddings: state.items.map(exportSidePadding),
          spacing: state.spacing,
          spacingColor: state.spacingColor,
          spacingFillMode: state.spacingFillMode,
          spacingMicroShadowPercent: state.spacingMicroShadowPercent,
          backgroundColor: state.backgroundColor,
          outputWidth: state.exportWidth,
          outputPath: await join(outputDir, `产品_${index + 1}.jpg`)
        });
      }
    } catch (error) {
      failed += 1;
      errors.push(`第 ${index + 1} 组：${error?.message || error}`);
    }
  }
  state.config.last_save_dir = outputDir;
  if (isTauri()) await invoke("save_config", { config: state.config }).catch(() => {});
  const message = failed ? `替换导出完成，失败 ${failed} 组：${errors[0] || "未知错误"}` : "替换导出完成";
  setStatus(message);
  showToast(message);
  if (!failed) await openTargetFolder(outputDir);
}

async function chooseReferenceImages(itemId) {
  const result = await open({
    multiple: true,
    directory: false,
    filters: [{ name: "Images", extensions: ["jpg", "jpeg", "png", "webp", "bmp", "tif", "tiff"] }]
  });
  const paths = Array.isArray(result) ? result : result ? [result] : [];
  await importReferencePaths(itemId, paths);
}

async function chooseProductImages() {
  const result = await open({
    multiple: true,
    directory: false,
    filters: [{ name: "Images", extensions: ["jpg", "jpeg", "png", "webp", "bmp", "tif", "tiff"] }]
  });
  const paths = Array.isArray(result) ? result : result ? [result] : [];
  await importProductPaths(paths);
}

function renderProductGrid() {
  refs.productGrid.innerHTML = "";
  if (!state.productImages.length) {
    refs.productGrid.innerHTML = `<div class="product-empty">还没有产品图</div>`;
    return;
  }
  for (const product of state.productImages) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "product-card";
    card.title = product.name;
    const image = document.createElement("img");
    image.src = product.url;
    image.alt = product.name;
    const remove = document.createElement("span");
    remove.className = "product-remove";
    remove.textContent = "×";
    remove.addEventListener("click", event => {
      event.stopPropagation();
      state.productImages = state.productImages.filter(item => item.id !== product.id);
      state.productPathSet.delete(product.path);
      saveProductImages();
      renderProductGrid();
      syncInputs();
    });
    card.addEventListener("click", () => openProductPreview(product.url));
    card.append(image, remove);
    refs.productGrid.appendChild(card);
  }
}

function openProductModal() {
  renderProductGrid();
  refs.productModal.classList.add("show");
  syncInputs();
}

function closeProductModal() {
  saveProductImages();
  refs.productModal.classList.remove("show");
}

function openProductPreview(url) {
  if (refs.productPreviewImage.src?.startsWith("blob:")) URL.revokeObjectURL(refs.productPreviewImage.src);
  refs.productPreviewImage.src = url;
  refs.productPreviewLayer.classList.add("show");
}

function closeProductPreview() {
  refs.productPreviewLayer.classList.remove("show");
  if (refs.productPreviewImage.src?.startsWith("blob:")) URL.revokeObjectURL(refs.productPreviewImage.src);
  refs.productPreviewImage.src = "";
}

async function chooseFiles() {
  if (!isTauri()) {
    refs.fileInput.removeAttribute("webkitdirectory");
    refs.fileInput.removeAttribute("directory");
    refs.fileInput.multiple = true;
    refs.fileInput.value = "";
    refs.fileInput.click();
    return;
  }
  const result = await open({
    multiple: true,
    directory: false,
    filters: [
      {
        name: "Images",
        extensions: ["jpg", "jpeg", "png", "webp", "bmp", "tif", "tiff"]
      }
    ]
  });
  const paths = Array.isArray(result) ? result : result ? [result] : [];
  await importPaths(paths);
}

async function chooseFolder() {
  if (!isTauri()) {
    refs.fileInput.setAttribute("webkitdirectory", "");
    refs.fileInput.setAttribute("directory", "");
    refs.fileInput.multiple = true;
    refs.fileInput.value = "";
    refs.fileInput.click();
    return;
  }
  const result = await open({
    multiple: true,
    directory: true
  });
  const paths = Array.isArray(result) ? result : result ? [result] : [];
  await importPaths(paths);
}

function isListSortBlockedTarget(target) {
  return Boolean(target?.closest?.("button, input, textarea, select, .prompt-body, .risk-body, .replacement-panel, .side-padding-panel, .graphic-properties-panel"));
}

function startSort(sourceId, event, options = {}) {
  const targetSelector = options.targetSelector || ".list-item";
  const scrollElement = options.scrollElement || refs.imageList;
  const renderSurface = options.renderSurface || (targetSelector === ".preview-frame" ? renderPreview : renderList);
  const startX = event.clientX;
  const startY = event.clientY;

  const applySortClasses = () => {
    const root = targetSelector === ".preview-frame" ? refs.previewCanvas : refs.imageList;
    for (const element of root.querySelectorAll(targetSelector)) {
      element.classList.remove("sort-source", "sort-before", "sort-after");
      if (element.dataset.id === state.sortState.sourceId) {
        element.classList.add("sort-source");
      }
      if (element.dataset.id === state.sortState.targetId) {
        element.classList.add(state.sortState.placement === "before" ? "sort-before" : "sort-after");
      }
    }
  };

  const activateSort = (pointerX, pointerY) => {
    event.preventDefault();
    state.sortState = {
      active: true,
      sourceId,
      targetId: "",
      placement: "after",
      pointerX,
      pointerY,
      autoScrollFrame: 0
    };
    document.body.classList.add("is-sorting");
    renderSurface();
    state.sortState.autoScrollFrame = requestAnimationFrame(autoScrollSortSurface);
  };

  const updateSortTarget = (pointerX, pointerY) => {
    const targetElement = document.elementFromPoint(pointerX, pointerY)?.closest(targetSelector);
    if (!targetElement) {
      state.sortState.targetId = "";
      applySortClasses();
      return;
    }
    const targetId = targetElement.dataset.id;
    if (!targetId || targetId === sourceId) {
      state.sortState.targetId = "";
      applySortClasses();
      return;
    }
    const rect = targetElement.getBoundingClientRect();
    state.sortState.targetId = targetId;
    state.sortState.placement = pointerY < rect.top + rect.height / 2 ? "before" : "after";
    applySortClasses();
  };

  const onPointerMove = moveEvent => {
    if (!state.sortState.active) {
      const distanceX = moveEvent.clientX - startX;
      const distanceY = moveEvent.clientY - startY;
      if (Math.hypot(distanceX, distanceY) < SORT_DRAG_THRESHOLD) return;
      activateSort(moveEvent.clientX, moveEvent.clientY);
    }
    state.sortState.pointerX = moveEvent.clientX;
    state.sortState.pointerY = moveEvent.clientY;
    updateSortTarget(moveEvent.clientX, moveEvent.clientY);
  };

  const autoScrollSortSurface = () => {
    if (!state.sortState.active) return;

    const listRect = scrollElement.getBoundingClientRect();
    const pointerY = state.sortState.pointerY;
    let scrollDelta = 0;

    if (pointerY < listRect.top + SORT_AUTO_SCROLL_EDGE) {
      const distance = Math.max(0, pointerY - listRect.top);
      const strength = (SORT_AUTO_SCROLL_EDGE - distance) / SORT_AUTO_SCROLL_EDGE;
      scrollDelta = -Math.ceil(strength * SORT_AUTO_SCROLL_MAX_SPEED);
    } else if (pointerY > listRect.bottom - SORT_AUTO_SCROLL_EDGE) {
      const distance = Math.max(0, listRect.bottom - pointerY);
      const strength = (SORT_AUTO_SCROLL_EDGE - distance) / SORT_AUTO_SCROLL_EDGE;
      scrollDelta = Math.ceil(strength * SORT_AUTO_SCROLL_MAX_SPEED);
    }

    if (scrollDelta) {
      scrollElement.scrollTop += scrollDelta;
      updateSortTarget(state.sortState.pointerX, pointerY);
    }

    state.sortState.autoScrollFrame = requestAnimationFrame(autoScrollSortSurface);
  };

  const onPointerUp = () => {
    document.removeEventListener("pointermove", onPointerMove);
    document.removeEventListener("pointerup", onPointerUp);
    document.removeEventListener("pointercancel", onPointerUp);
    if (!state.sortState.active) return;
    document.body.classList.remove("is-sorting");
    cancelAnimationFrame(state.sortState.autoScrollFrame);
    const { targetId, placement } = state.sortState;
    if (targetId) {
      reorderItems(sourceId, targetId, placement);
    }
    state.selectedIds = new Set([sourceId]);
    state.sortState = { active: false, sourceId: "", targetId: "", placement: "after", pointerX: 0, pointerY: 0, autoScrollFrame: 0 };
    renderAll();
  };

  document.addEventListener("pointermove", onPointerMove);
  document.addEventListener("pointerup", onPointerUp);
  document.addEventListener("pointercancel", onPointerUp);
}

function reorderItems(sourceId, targetId, placement) {
  const sourceIndex = state.items.findIndex(item => item.id === sourceId);
  const targetIndex = state.items.findIndex(item => item.id === targetId);
  if (sourceIndex === -1 || targetIndex === -1 || sourceIndex === targetIndex) return;

  const [moved] = state.items.splice(sourceIndex, 1);
  const actualPlacement = state.layerMode ? (placement === "before" ? "after" : "before") : placement;
  let nextIndex = targetIndex;
  if (sourceIndex < targetIndex) {
    nextIndex -= 1;
  }
  if (actualPlacement === "after") {
    nextIndex += 1;
  }
  state.items.splice(nextIndex, 0, moved);
}

async function saveImage() {
  if (!state.items.length) {
    showToast("请先添加图片");
    return;
  }
  await refreshGraphicLayers();
  const failed = state.items.filter(item => item.loadStatus === "failed" || !item.url);
  if (failed.length) {
    showToast("有图片加载失败，请重新添加后再导出");
    return;
  }
  try {
    const baseDir = state.config.last_save_dir || (await pictureDir());
    setStatus("正在导出，请稍候...");
    let exportedTarget = "";

    if (state.layerMode) {
      const defaultPath = await join(baseDir, "分层套版.png");
      let outputPath = await save({
        defaultPath,
        filters: [
          { name: "PNG Image", extensions: ["png"] },
          { name: "JPEG Image", extensions: ["jpg", "jpeg"] }
        ]
      });
      if (!outputPath) {
        setStatus("");
        return;
      }
      if (!/\.(png|jpg|jpeg)$/i.test(outputPath)) outputPath += ".png";
      const bounds = ensureLayerBounds(false);
      const payload = await layeredExportPayload();
      await invoke("save_layered_image", {
        paths: payload.paths,
        layerTransforms: payload.layerTransforms,
        layerBlendModes: payload.layerBlendModes,
        backgroundColor: state.backgroundColor,
        outputWidth: bounds.width,
        outputHeight: bounds.height,
        outputPath
      });
      state.config.last_save_dir = outputPath.replace(/[\\/][^\\/]+$/, "");
      exportedTarget = outputPath;
    } else if (state.exportMode === "slices") {
      const outputDir = await open({
        directory: true,
        multiple: false,
        defaultPath: baseDir
      });
      if (!outputDir) {
        setStatus("");
        return;
      }
      await invoke("save_sliced_images", {
        paths: state.items.map(item => item.path),
        sidePaddings: state.items.map(exportSidePadding),
        spacing: state.spacing,
        spacingColor: state.spacingColor,
        spacingFillMode: state.spacingFillMode,
        spacingMicroShadowPercent: state.spacingMicroShadowPercent,
        backgroundColor: state.backgroundColor,
        outputWidth: state.exportWidth,
        outputDir
      });
      state.config.last_save_dir = outputDir;
      exportedTarget = outputDir;
    } else {
      const defaultPath = await join(baseDir, DEFAULT_OUTPUT_NAME);
      let outputPath = await save({
        defaultPath,
        filters: [{ name: "JPEG Image", extensions: ["jpg", "jpeg"] }]
      });
      if (!outputPath) {
        setStatus("");
        return;
      }
      if (!/\.(jpg|jpeg)$/i.test(outputPath)) {
        outputPath += ".jpg";
      }
      await invoke("save_stitched_image", {
        paths: state.items.map(item => item.path),
        sidePaddings: state.items.map(exportSidePadding),
        spacing: state.spacing,
        spacingColor: state.spacingColor,
        spacingFillMode: state.spacingFillMode,
        spacingMicroShadowPercent: state.spacingMicroShadowPercent,
        backgroundColor: state.backgroundColor,
        outputWidth: state.exportWidth,
        outputPath
      });
      state.config.last_save_dir = outputPath.replace(/[\\/][^\\/]+$/, "");
      exportedTarget = outputPath;
    }

    await invoke("save_config", { config: state.config });
    setStatus("导出成功");
    showToast("导出成功");
    await openTargetFolder(exportedTarget);
  } catch (error) {
    setStatus("");
    showToast(`导出失败：${error.message || error}`);
  }
}

async function saveTemplateImages() {
  const templateItems = state.items.filter(item => ["done", "copied"].includes(item.templateStatus) && item.templatePath);
  if (!templateItems.length) {
    showToast("暂无可导出的套版图");
    return;
  }
  try {
    const baseDir = state.config.last_save_dir || (await pictureDir());
    setStatus("正在导出套版，请稍候...");
    const paths = templateItems.map(item => item.templatePath);
    let exportedTarget = "";

    if (state.exportMode === "slices") {
      const outputDir = await open({ directory: true, multiple: false, defaultPath: baseDir });
      if (!outputDir) {
        setStatus("");
        return;
      }
      await invoke("save_sliced_images", {
        paths,
        sidePaddings: templateItems.map(exportSidePadding),
        spacing: state.spacing,
        spacingColor: state.spacingColor,
        spacingFillMode: state.spacingFillMode,
        spacingMicroShadowPercent: state.spacingMicroShadowPercent,
        backgroundColor: state.backgroundColor,
        outputWidth: state.exportWidth,
        outputDir
      });
      state.config.last_save_dir = outputDir;
      exportedTarget = outputDir;
    } else {
      const defaultPath = await join(baseDir, "套版长图.jpg");
      let outputPath = await save({
        defaultPath,
        filters: [{ name: "JPEG Image", extensions: ["jpg", "jpeg"] }]
      });
      if (!outputPath) {
        setStatus("");
        return;
      }
      if (!/\.(jpg|jpeg)$/i.test(outputPath)) outputPath += ".jpg";
      await invoke("save_stitched_image", {
        paths,
        sidePaddings: templateItems.map(exportSidePadding),
        spacing: state.spacing,
        spacingColor: state.spacingColor,
        spacingFillMode: state.spacingFillMode,
        spacingMicroShadowPercent: state.spacingMicroShadowPercent,
        backgroundColor: state.backgroundColor,
        outputWidth: state.exportWidth,
        outputPath
      });
      state.config.last_save_dir = outputPath.replace(/[\\/][^\\/]+$/, "");
      exportedTarget = outputPath;
    }
    await invoke("save_config", { config: state.config });
    setStatus("套版导出成功");
    showToast("套版导出成功");
    await openTargetFolder(exportedTarget);
  } catch (error) {
    setStatus("");
    showToast(`套版导出失败：${error.message || error}`);
  }
}

function applySpacing() {
  const raw = refs.spacingInput.value.trim();
  if (!raw) {
    state.spacing = 0;
    renderAll();
    return;
  }
  if (!/^\d+$/.test(raw)) {
    showToast("请输入大于等于 0 的整数");
    return;
  }
  state.spacing = Number(raw);
  renderAll();
}

function applyColor() {
  const color = normalizeHexColor(refs.colorInput.value);
  if (!color) {
    showToast("请输入正确的颜色值，例如 #FFFFFF");
    return;
  }
  state.spacingColor = color;
  renderAll();
}

async function pickColor() {
  if ("EyeDropper" in window) {
    try {
      const picker = new window.EyeDropper();
      const result = await picker.open();
      const color = normalizeHexColor(result.sRGBHex);
      if (color) {
        state.spacingColor = color;
        refs.colorInput.value = color;
        renderAll();
        await copyText(color);
        showToast("已取色并复制到剪贴板");
      }
      return;
    } catch {
      return;
    }
  }
  const input = document.createElement("input");
  input.type = "color";
  input.value = state.spacingColor;
  input.addEventListener("input", async () => {
    state.spacingColor = input.value.toUpperCase();
    refs.colorInput.value = state.spacingColor;
    renderAll();
    await copyText(state.spacingColor);
  });
  input.click();
}

function rgbToHex(red, green, blue) {
  return `#${[red, green, blue].map(value => Math.max(0, Math.min(255, value)).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

async function pickSidePaddingColor(itemId) {
  if ("EyeDropper" in window) {
    try {
      const picker = new window.EyeDropper();
      const result = await picker.open();
      return normalizeHexColor(result.sRGBHex);
    } catch {
      return "";
    }
  }

  showToast("请在预览图上点击取色");
  refs.previewWrap.classList.add("picking-side-color");
  return new Promise(resolve => {
    const cleanup = () => {
      refs.previewWrap.classList.remove("picking-side-color");
      refs.previewWrap.removeEventListener("click", onClick, true);
      document.removeEventListener("keydown", onKeydown, true);
    };
    const onKeydown = event => {
      if (event.key === "Escape") {
        cleanup();
        resolve("");
      }
    };
    const onClick = event => {
      const canvas = event.target?.closest?.("canvas");
      if (!canvas || !refs.previewWrap.contains(canvas)) return;
      event.preventDefault();
      event.stopPropagation();
      const rect = canvas.getBoundingClientRect();
      const x = Math.floor(((event.clientX - rect.left) / rect.width) * canvas.width);
      const y = Math.floor(((event.clientY - rect.top) / rect.height) * canvas.height);
      try {
        const pixel = canvas.getContext("2d").getImageData(x, y, 1, 1).data;
        cleanup();
        resolve(rgbToHex(pixel[0], pixel[1], pixel[2]));
      } catch {
        cleanup();
        resolve("");
      }
    };
    refs.previewWrap.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKeydown, true);
  });
}

function setZoom(nextZoom, anchorEvent = null) {
  const oldZoom = state.previewZoom;
  const rect = refs.previewWrap.getBoundingClientRect();
  const anchorX = anchorEvent ? refs.previewWrap.scrollLeft + anchorEvent.clientX - rect.left : 0;
  const anchorY = anchorEvent ? refs.previewWrap.scrollTop + anchorEvent.clientY - rect.top : 0;
  state.previewZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number(nextZoom.toFixed(2))));
  renderPreview();
  syncInputs();
  if (anchorEvent && oldZoom !== state.previewZoom) {
    const ratio = state.previewZoom / oldZoom;
    requestAnimationFrame(() => {
      refs.previewWrap.scrollLeft = anchorX * ratio - (anchorEvent.clientX - rect.left);
      refs.previewWrap.scrollTop = anchorY * ratio - (anchorEvent.clientY - rect.top);
    });
  }
}

function fillProviderOptions() {
  refs.promptProviderSelect.innerHTML = "";
  refs.riskProviderSelect.innerHTML = "";
  refs.imageProviderSelect.innerHTML = "";
  for (const provider of Object.keys(PROVIDERS)) {
    for (const select of [refs.promptProviderSelect, refs.riskProviderSelect, refs.imageProviderSelect]) {
      const option = document.createElement("option");
      option.value = provider;
      option.textContent = provider;
      select.appendChild(option);
    }
  }
}

function refreshRiskCategories() {
  refs.riskCategorySelect.innerHTML = "";
  for (const category of Object.keys(state.riskLexicon)) {
    const option = document.createElement("option");
    option.value = category;
    option.textContent = category;
    refs.riskCategorySelect.appendChild(option);
  }
  refs.riskCategorySelect.value = state.selectedRiskCategory;
}

function renderRiskLexicon() {
  refreshRiskCategories();
  const keyword = state.riskSearch.trim().toLowerCase();
  const rows = [];
  for (const [category, words] of Object.entries(state.riskLexicon)) {
    if (keyword && !category.toLowerCase().includes(keyword) && !words.some(word => word.toLowerCase().includes(keyword))) {
      continue;
    }
    rows.push(`<div class="risk-category-title">${escapeHtml(category)}</div>`);
    const filtered = words.filter(word => !keyword || category.toLowerCase().includes(keyword) || word.toLowerCase().includes(keyword));
    for (const word of filtered) {
      rows.push(`
        <div class="risk-word-row" data-category="${escapeHtml(category)}" data-word="${escapeHtml(word)}">
          <input class="input risk-word-edit" value="${escapeHtml(word)}" />
          <button class="button risk-word-save">保存</button>
          <button class="weak risk-word-delete">删除</button>
        </div>
      `);
    }
  }
  refs.riskWordList.innerHTML = rows.join("") || `<div class="empty-risk-list">没有找到匹配的风险词</div>`;
}

function openRiskModal() {
  renderRiskLexicon();
  refs.riskModal.classList.add("show");
}

function closeRiskModal() {
  refs.riskModal.classList.remove("show");
}

function addRiskWord() {
  const category = refs.riskCategorySelect.value || state.selectedRiskCategory;
  const word = refs.riskWordInput.value.trim();
  if (!word) {
    showToast("请输入风险词");
    return;
  }
  if (!state.riskLexicon[category]) state.riskLexicon[category] = [];
  const exists = state.riskLexicon[category].some(value => value.trim().toLowerCase() === word.toLowerCase());
  if (exists) {
    showToast("该极限词已存在，请勿重复新增");
    return;
  }
  state.riskLexicon[category].push(word);
  state.riskLexicon = normalizeRiskLexicon(state.riskLexicon);
  saveRiskLexicon();
  refs.riskWordInput.value = "";
  renderRiskLexicon();
  showToast("已新增极限词");
}

function updateRiskWord(category, oldWord, nextWord) {
  const word = nextWord.trim();
  if (!word) {
    showToast("风险词不能为空");
    return;
  }
  const list = state.riskLexicon[category] || [];
  const index = list.indexOf(oldWord);
  if (index >= 0) {
    list[index] = word;
    state.riskLexicon = normalizeRiskLexicon(state.riskLexicon);
    saveRiskLexicon();
    renderRiskLexicon();
    showToast("词库已更新");
  }
}

function deleteRiskWord(category, word) {
  state.riskLexicon[category] = (state.riskLexicon[category] || []).filter(value => value !== word);
  state.riskLexicon = normalizeRiskLexicon(state.riskLexicon);
  saveRiskLexicon();
  renderRiskLexicon();
}

function exportRiskLexicon() {
  const format = refs.riskExportFormatSelect.value || "json";
  const mime = format === "csv" ? "text/csv;charset=utf-8" : format === "txt" ? "text/plain;charset=utf-8" : "application/json;charset=utf-8";
  const blob = new Blob([serializeRiskLexicon(format)], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `极限词库.${format}`;
  link.click();
  URL.revokeObjectURL(url);
  showToast(`已导出 ${format.toUpperCase()} 词库，共 ${riskLexiconWordCount(state.riskLexicon)} 个词`);
}

async function importRiskLexicon(file) {
  if (!file) return;
  try {
    const text = await file.text();
    const incoming = parseRiskLexiconFile(text, file.name);
    const mode = refs.riskImportModeSelect.value || "append";
    state.riskLexicon = mode === "replace"
      ? normalizeRiskLexicon(incoming)
      : mergeRiskLexicons(state.riskLexicon, incoming);
    state.selectedRiskCategory = Object.keys(state.riskLexicon)[0] || "极限词";
    saveRiskLexicon();
    renderRiskLexicon();
    const action = mode === "replace" ? "覆盖" : "追加";
    showToast(`词库${action}导入成功，当前共 ${riskLexiconWordCount(state.riskLexicon)} 个词`);
  } catch {
    showToast("词库格式不正确，请使用 JSON、TXT 或 CSV");
  }
}

function resetRiskLexicon() {
  openConfirm("确认恢复默认词库？", "恢复默认会覆盖当前极限词库，用户新增和修改的词会被清除。此操作无法撤销。", "确认恢复", confirmResetRiskLexicon);
}

function closeConfirmModal() {
  refs.confirmModal.classList.remove("show");
  state.confirmAction = null;
}

function openConfirm(title, text, buttonText, action) {
  refs.confirmTitle.textContent = title;
  refs.confirmText.textContent = text;
  refs.confirmActionBtn.textContent = buttonText || "确认";
  state.confirmAction = action;
  refs.confirmModal.classList.add("show");
}

function runConfirmAction() {
  const action = state.confirmAction;
  closeConfirmModal();
  if (typeof action === "function") {
    action();
  }
}

function confirmResetRiskLexicon() {
  state.riskLexicon = structuredClone(DEFAULT_RISK_LEXICON);
  state.selectedRiskCategory = "极限词";
  saveRiskLexicon();
  renderRiskLexicon();
  showToast("已恢复默认词库");
}

function updateProviderFields(kind, provider, resetValues = true) {
  const preset = PROVIDERS[provider] || PROVIDERS.Gemini;
  const fieldMap = {
    prompt: {
      baseInput: refs.promptBaseUrlInput,
      modelInput: refs.promptModelInput,
      hint: refs.promptProviderHint,
      emptyModel: false,
      note: "用于识别图片并生成提示词。"
    },
    risk: {
      baseInput: refs.riskBaseUrlInput,
      modelInput: refs.riskModelInput,
      hint: refs.riskProviderHint,
      emptyModel: false,
      note: "用于 OCR 识别并匹配极限词。"
    },
    image: {
      baseInput: refs.imageBaseUrlInput,
      modelInput: refs.imageModelInput,
      hint: refs.imageProviderHint,
      emptyModel: true,
      note: "用于一键套版和生图。"
    }
  };
  const fields = fieldMap[kind] || fieldMap.prompt;
  if (resetValues) {
    fields.baseInput.value = preset.base_url;
    fields.modelInput.value = fields.emptyModel ? (preset.imageModel || "") : preset.model;
  }
  fields.hint.textContent = `${preset.hint}\n${fields.note}`;
}

function openSettings() {
  const promptApi = getPromptApiConfig();
  const riskApi = getRiskApiConfig();
  const imageApi = getImageApiConfig();
  refs.promptProviderSelect.value = promptApi.provider || "Gemini";
  refs.promptApiKeyInput.value = promptApi.api_key || "";
  refs.promptBaseUrlInput.value = promptApi.base_url || PROVIDERS[refs.promptProviderSelect.value].base_url;
  refs.promptModelInput.value = promptApi.model || PROVIDERS[refs.promptProviderSelect.value].model;
  refs.promptApiKeyInput.type = "password";
  refs.riskProviderSelect.value = riskApi.provider || "Gemini";
  refs.riskApiKeyInput.value = riskApi.api_key || "";
  refs.riskBaseUrlInput.value = riskApi.base_url || PROVIDERS[refs.riskProviderSelect.value].base_url;
  refs.riskModelInput.value = riskApi.model || PROVIDERS[refs.riskProviderSelect.value].model;
  refs.riskApiKeyInput.type = "password";
  refs.imageProviderSelect.value = imageApi.provider || "Gemini";
  refs.imageApiKeyInput.value = imageApi.api_key || "";
  refs.imageBaseUrlInput.value = imageApi.base_url || PROVIDERS[refs.imageProviderSelect.value].base_url;
  refs.imageModelInput.value = imageApi.model || "";
  refs.imageApiKeyInput.type = "password";
  refs.updateManifestUrlInput.value = state.config.update?.manifest_url || "";
  updateProviderFields("prompt", refs.promptProviderSelect.value, false);
  updateProviderFields("risk", refs.riskProviderSelect.value, false);
  updateProviderFields("image", refs.imageProviderSelect.value, false);
  refs.settingsModal.classList.add("show");
}

function closeSettings() {
  refs.settingsModal.classList.remove("show");
}

function readPromptApiForm() {
  return {
    provider: refs.promptProviderSelect.value,
    api_key: refs.promptApiKeyInput.value.trim(),
    base_url: refs.promptBaseUrlInput.value.trim(),
    model: refs.promptModelInput.value.trim()
  };
}

function readRiskApiForm() {
  return {
    provider: refs.riskProviderSelect.value,
    api_key: refs.riskApiKeyInput.value.trim(),
    base_url: refs.riskBaseUrlInput.value.trim(),
    model: refs.riskModelInput.value.trim()
  };
}

function readImageApiForm() {
  const provider = refs.imageProviderSelect.value;
  const baseUrl = refs.imageBaseUrlInput.value.trim();
  const model = refs.imageModelInput.value.trim();
  return {
    provider,
    api_key: refs.imageApiKeyInput.value.trim(),
    base_url: baseUrl,
    model: model || (provider === "OpenAI" || /api\.openai\.com|easyrouter\.io/i.test(baseUrl) ? PROVIDERS.OpenAI.imageModel : "")
  };
}

function hardenApiKeyInput(input) {
  if (!input) return;
  input.setAttribute("autocomplete", "off");
  input.setAttribute("spellcheck", "false");
  input.addEventListener("copy", event => event.preventDefault());
  input.addEventListener("cut", event => event.preventDefault());
  input.addEventListener("contextmenu", event => event.preventDefault());
}

async function saveAllApiSettings() {
  state.config.prompt_api = readPromptApiForm();
  state.config.risk_api = readRiskApiForm();
  state.config.image_api = readImageApiForm();
  const updateManifestUrl = refs.updateManifestUrlInput.value.trim() || DEFAULT_UPDATE_MANIFEST_URL;
  state.config.update = { manifest_url: updateManifestUrl };
  refs.updateManifestUrlInput.value = updateManifestUrl;
  await invoke("save_config", { config: state.config });
  updateApiStatus();
  closeSettings();
  showToast("API 设置已保存");
  checkForUpdates(true);
}

async function loadConfig() {
  if (!isTauri()) return;
  try {
    const config = await invoke("load_config");
    state.config = normalizeAppConfig(config);
    state.spacingFillMode = state.config.spacing_fill_mode || state.spacingFillMode;
    state.spacingMicroShadowPercent = normalizeMicroShadowPercent(state.config.spacing_micro_shadow_percent);
    await invoke("save_config", { config: state.config });
    renderUpdateNotice();
  } catch {
    // ignore and use defaults
  }
}

function elementFromDropPosition(position) {
  if (!position) return null;
  const rawX = Number(position.x ?? position[0]);
  const rawY = Number(position.y ?? position[1]);
  if (!Number.isFinite(rawX) || !Number.isFinite(rawY)) return null;
  const candidates = [
    [rawX, rawY],
    [rawX / window.devicePixelRatio, rawY / window.devicePixelRatio]
  ];
  for (const [x, y] of candidates) {
    if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) continue;
    const element = document.elementFromPoint(x, y);
    if (element) return element;
  }
  return null;
}

function referenceItemIdFromDropPayload(payload) {
  const element = elementFromDropPosition(payload?.position);
  return element?.closest?.("[data-reference-item-id]")?.dataset?.referenceItemId || "";
}

async function initWindowFileDrop() {
  if (!isTauri()) return;
  const currentWindow = getCurrentWindow();
  await currentWindow.onDragDropEvent(event => {
    const payload = event.payload;
    if (payload.type === "over") {
      document.body.classList.add("is-file-dragging");
      state.fileDragReferenceItemId = referenceItemIdFromDropPayload(payload);
    } else if (payload.type === "drop") {
      document.body.classList.remove("is-file-dragging");
      const referenceItemId = referenceItemIdFromDropPayload(payload) || state.fileDragReferenceItemId;
      state.fileDragReferenceItemId = "";
      if (refs.productModal.classList.contains("show")) {
        importProductPaths(payload.paths);
      } else if (referenceItemId) {
        importReferencePaths(referenceItemId, payload.paths);
      } else if (state.items.some(item => item.isReplacementExpanded && item.type !== "text")) {
        const item = state.items.find(value => value.isReplacementExpanded && value.type !== "text");
        importReplacementPaths(item.id, payload.paths);
      } else {
        importPaths(payload.paths);
      }
    } else {
      document.body.classList.remove("is-file-dragging");
      state.fileDragReferenceItemId = "";
    }
  });
}

function bindEvents() {
  refs.dropArea.addEventListener("click", event => {
    if (event.target === refs.chooseFilesBtn || event.target === refs.chooseFolderBtn) return;
    chooseFiles();
  });
  refs.chooseFilesBtn.addEventListener("click", chooseFiles);
  refs.chooseFolderBtn.addEventListener("click", chooseFolder);
  refs.addImagesBtn.addEventListener("click", () => {
    exitLedgerMode();
    exitLayerModeSilently();
    renderAll();
    chooseFiles();
  });
  refs.addFolderBtn.addEventListener("click", () => {
    exitLedgerMode();
    exitLayerModeSilently();
    renderAll();
    chooseFolder();
  });
  refs.fileInput.addEventListener("change", event => {
    importBrowserFiles(event.target.files);
    event.target.value = "";
    event.target.removeAttribute("webkitdirectory");
    event.target.removeAttribute("directory");
  });
  refs.replacementFileInput.addEventListener("change", event => {
    importBrowserReplacementFiles(state.replacementImportTargetId, event.target.files);
    event.target.value = "";
  });
  refs.templateWorkflowBtn.addEventListener("click", () => {
    exitLedgerMode();
    exitLayerModeSilently();
    openTemplateWorkflow();
  });
  refs.costLedgerBtn.addEventListener("click", toggleLedgerMode);
  refs.ledgerBackBtn.addEventListener("click", exitLedgerMode);
  refs.generateAllBtn.addEventListener("click", () => {
    exitLedgerMode();
    exitLayerModeSilently();
    toggleGenerateAll();
  });
  refs.copyAllBtn.addEventListener("click", () => {
    exitLedgerMode();
    exitLayerModeSilently();
    copyAllPrompts();
    renderAll();
  });
  refs.riskLexiconBtn.addEventListener("click", () => {
    exitLedgerMode();
    exitLayerModeSilently();
    openRiskModal();
    renderAll();
  });
  refs.inspectAllBtn.addEventListener("click", () => {
    exitLedgerMode();
    exitLayerModeSilently();
    checkAllRisks();
  });
  refs.batchReplaceBtn.addEventListener("click", () => {
    exitLedgerMode();
    toggleBatchReplaceMode();
  });
  refs.layerTemplateBtn.addEventListener("click", () => {
    exitLedgerMode();
    toggleLayerTemplateMode();
  });
  refs.moveToolBtn.addEventListener("click", () => setActiveTool("move"));
  refs.textToolBtn.addEventListener("click", () => setActiveTool("text"));
  refs.rectToolBtn.addEventListener("click", () => setActiveTool("rect"));
  refs.previewWrap.addEventListener("pointerdown", handleSpacePanPointerDown, true);
  refs.previewWrap.addEventListener("pointermove", handleSpacePanPointerMove, true);
  refs.previewWrap.addEventListener("pointerup", finishSpacePanDrag, true);
  refs.previewWrap.addEventListener("pointercancel", finishSpacePanDrag, true);
  refs.previewWrap.addEventListener("pointerdown", handleToolPointerDown);
  refs.previewWrap.addEventListener("pointermove", handleToolPointerMove);
  refs.previewWrap.addEventListener("pointerup", handleToolPointerUp);
  refs.previewWrap.addEventListener("pointercancel", handleToolPointerUp);
  refs.previewWrap.addEventListener("click", handlePreviewBlankClick);
  refs.promptTemplateBtn.addEventListener("click", () => {
    exitLedgerMode();
    exitLayerModeSilently();
    openPromptTemplateModal();
    renderAll();
  });
  refs.exitTemplateBtn.addEventListener("click", () => {
    exitLedgerMode();
    exitTemplateMode();
  });
  refs.exportTemplateBtn.addEventListener("click", () => {
    exitLedgerMode();
    saveTemplateImages();
  });
  refs.saveBtn.addEventListener("click", () => {
    exitLedgerMode();
    saveImage();
  });
  refs.carouselSeparatorBtn.addEventListener("click", () => {
    exitLedgerMode();
    insertCarouselSeparator();
  });
  refs.commonShopHeaderBtn.addEventListener("click", () => {
    exitLedgerMode();
    insertCommonShopHeader();
  });
  refs.replacementExportBtn.addEventListener("click", () => {
    exitLedgerMode();
    replacementExport();
  });
  refs.clearBtn.addEventListener("click", () => {
    exitLedgerMode();
    clearImages();
  });
  refs.spacingApplyBtn.addEventListener("click", applySpacing);
  refs.spacingFillModeSelect.addEventListener("change", () => {
    state.spacingFillMode = refs.spacingFillModeSelect.value || DEFAULT_SPACING_FILL_MODE;
    state.config.spacing_fill_mode = state.spacingFillMode;
    state.config.spacing_micro_shadow_percent = normalizeMicroShadowPercent(state.spacingMicroShadowPercent);
    if (isTauri()) invoke("save_config", { config: state.config }).catch(() => {});
    renderAll();
  });
  refs.spacingMicroShadowInput.addEventListener("input", () => {
    state.spacingMicroShadowPercent = normalizeMicroShadowPercent(refs.spacingMicroShadowInput.value);
    state.config.spacing_micro_shadow_percent = state.spacingMicroShadowPercent;
    refs.spacingMicroShadowInput.value = String(state.spacingMicroShadowPercent);
    renderAll();
  });
  refs.spacingMicroShadowInput.addEventListener("change", () => {
    state.spacingMicroShadowPercent = normalizeMicroShadowPercent(refs.spacingMicroShadowInput.value);
    state.config.spacing_micro_shadow_percent = state.spacingMicroShadowPercent;
    refs.spacingMicroShadowInput.value = String(state.spacingMicroShadowPercent);
    if (isTauri()) invoke("save_config", { config: state.config }).catch(() => {});
    renderAll();
  });
  refs.colorApplyBtn.addEventListener("click", applyColor);
  refs.exportWidthSelect.addEventListener("change", () => {
    if (refs.exportWidthSelect.value === "custom") {
      state.customExportWidth = true;
      refs.customExportWidthInput.hidden = false;
      refs.customExportWidthInput.value = String(state.exportWidth || 790);
      refs.customExportWidthInput.focus();
    } else {
      state.customExportWidth = false;
      state.exportWidth = Number(refs.exportWidthSelect.value) || 790;
    }
    syncInputs();
  });
  refs.customExportWidthInput.addEventListener("input", () => {
    const value = Math.max(1, Math.round(Number(refs.customExportWidthInput.value) || 0));
    if (value) state.exportWidth = value;
  });
  refs.customExportWidthInput.addEventListener("change", () => {
    const value = Math.max(1, Math.round(Number(refs.customExportWidthInput.value) || state.exportWidth || 790));
    state.exportWidth = value;
    syncInputs();
  });
  refs.exportModeSelect.addEventListener("change", () => {
    state.exportMode = refs.exportModeSelect.value;
    syncInputs();
  });
  refs.eyedropperBtn.addEventListener("click", pickColor);
  refs.zoomOutBtn.addEventListener("click", () => setZoom(state.previewZoom - ZOOM_STEP));
  refs.zoomInBtn.addEventListener("click", () => setZoom(state.previewZoom + ZOOM_STEP));
  refs.apiSettingsBtn.addEventListener("click", () => {
    exitLedgerMode();
    exitLayerModeSilently();
    openSettings();
    renderAll();
  });
  refs.updateNoticeBtn.addEventListener("click", () => {
    exitLedgerMode();
    openUpdatePrompt();
  });
  refs.saveAllApiBtn.addEventListener("click", saveAllApiSettings);
  refs.checkUpdateBtn.addEventListener("click", () => checkForUpdates(true));
  refs.closeRiskBtn.addEventListener("click", closeRiskModal);
  refs.addRiskWordBtn.addEventListener("click", addRiskWord);
  refs.riskWordInput.addEventListener("keydown", event => {
    if (event.key === "Enter") addRiskWord();
  });
  refs.riskSearchInput.addEventListener("input", () => {
    state.riskSearch = refs.riskSearchInput.value;
    renderRiskLexicon();
  });
  refs.riskCategorySelect.addEventListener("change", () => {
    state.selectedRiskCategory = refs.riskCategorySelect.value;
  });
  refs.riskWordList.addEventListener("click", event => {
    const row = event.target.closest(".risk-word-row");
    if (!row) return;
    const category = row.dataset.category;
    const word = row.dataset.word;
    if (event.target.classList.contains("risk-word-save")) {
      updateRiskWord(category, word, row.querySelector(".risk-word-edit").value);
    }
    if (event.target.classList.contains("risk-word-delete")) {
      deleteRiskWord(category, word);
    }
  });
  refs.importRiskBtn.addEventListener("click", () => refs.riskImportInput.click());
  refs.riskImportInput.addEventListener("change", event => {
    importRiskLexicon(event.target.files?.[0]);
    event.target.value = "";
  });
  refs.exportRiskBtn.addEventListener("click", exportRiskLexicon);
  refs.resetRiskBtn.addEventListener("click", resetRiskLexicon);
  refs.chooseProductBtn.addEventListener("click", chooseProductImages);
  refs.productDropArea.addEventListener("click", event => {
    if (event.target === refs.chooseProductBtn) return;
    chooseProductImages();
  });
  refs.saveProductBtn.addEventListener("click", closeProductModal);
  refs.startTemplateBtn.addEventListener("click", startTemplateGeneration);
  refs.productPreviewLayer.addEventListener("click", closeProductPreview);
  refs.cancelConfirmBtn.addEventListener("click", closeConfirmModal);
  refs.confirmActionBtn.addEventListener("click", runConfirmAction);
  refs.extractModeRadio.addEventListener("change", () => {
    state.promptTemplateSettings.mode = "extract";
    syncPromptTemplateMode();
  });
  refs.templateModeRadio.addEventListener("change", () => {
    state.promptTemplateSettings.mode = "template";
    syncPromptTemplateMode();
  });
  refs.extractPromptInput.addEventListener("input", () => {
    state.promptTemplateSettings.extractText = refs.extractPromptInput.value;
  });
  refs.templatePromptInput.addEventListener("input", () => {
    state.promptTemplateSettings.templateText = refs.templatePromptInput.value;
    syncPromptTemplateMode();
  });
  refs.savePromptTemplateBtn.addEventListener("click", savePromptTemplateFromModal);
  refs.clearPromptTemplateBtn.addEventListener("click", clearPromptTemplateInput);
  refs.savePresetBtn.addEventListener("click", savePresetFromModal);
  refs.importPromptTemplateBtn.addEventListener("click", () => refs.promptTemplateImportInput.click());
  refs.promptTemplateImportInput.addEventListener("change", event => {
    importPromptTemplateSettings(event.target.files?.[0]);
    event.target.value = "";
  });
  refs.exportPromptTemplateBtn.addEventListener("click", exportPromptTemplateSettings);
  refs.closePromptTemplateBtn.addEventListener("click", closePromptTemplateModal);
  refs.renamePresetBtn.addEventListener("click", renameSelectedPreset);
  refs.deletePresetBtn.addEventListener("click", deleteSelectedPreset);
  document.addEventListener("click", event => {
    if (!refs.presetContextMenu.classList.contains("show")) return;
    if (event.target.closest("#presetContextMenu") || event.target.closest(".preset-tag")) return;
    closePresetMenu();
  });
  refs.promptProviderSelect.addEventListener("change", () => updateProviderFields("prompt", refs.promptProviderSelect.value, true));
  refs.riskProviderSelect.addEventListener("change", () => updateProviderFields("risk", refs.riskProviderSelect.value, true));
  refs.imageProviderSelect.addEventListener("change", () => updateProviderFields("image", refs.imageProviderSelect.value, true));
  refs.testPromptApiBtn.addEventListener("click", () => testApiConnection(readPromptApiForm(), "prompt"));
  refs.testRiskApiBtn.addEventListener("click", () => testApiConnection(readRiskApiForm(), "risk"));
  refs.testImageApiBtn.addEventListener("click", () => testApiConnection(readImageApiForm(), "image"));

  refs.previewWrap.addEventListener("wheel", event => {
    if (!event.ctrlKey) return;
    event.preventDefault();
    setZoom(state.previewZoom + (event.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP), event);
  }, { passive: false });
  refs.previewWrap.addEventListener("scroll", () => {
    if (state.draftScrollLock) {
      restoreDraftScroll();
      return;
    }
    syncSelectionFromPreviewScroll();
  }, { passive: true });
  refs.riskSummary.addEventListener("click", event => {
    const item = event.target.closest(".risk-summary-item");
    if (!item?.dataset.id) return;
    state.selectedIds = new Set([item.dataset.id]);
    renderList();
    scrollToImage(item.dataset.id);
    requestAnimationFrame(() => scrollListToImage(item.dataset.id));
  });
  document.addEventListener("paste", handlePaste);

  document.addEventListener("keydown", event => {
    if (event.code === "Space" && !isEditableTarget(event.target)) {
      event.preventDefault();
      if (!state.spacePanActive) setSpacePanActive(true);
      return;
    }
    if (nudgeSelectedLayers(event)) {
      event.preventDefault();
      return;
    }
    if (!isEditableTarget(event.target) && state.layerMode && !state.templateMode && event.key === "Control") {
      setActiveTool("move");
      return;
    }
    if (!isEditableTarget(event.target) && state.layerMode && !state.templateMode && !event.ctrlKey && !event.metaKey) {
      const key = event.key.toLowerCase();
      if (key === "v" || key === "t" || key === "r") {
        event.preventDefault();
        setActiveTool(key === "v" ? "move" : key === "t" ? "text" : "rect");
        return;
      }
    }
    if (handleLayerOrderShortcut(event)) {
      event.preventDefault();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z" && !isEditableTarget(event.target)) {
      if (undoLayerAction()) event.preventDefault();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a" && state.items.length) {
      event.preventDefault();
      state.selectedIds = new Set(state.items.map(item => item.id));
      renderList();
      return;
    }
    if (event.key === "Delete" && state.selectedIds.size) {
      event.preventDefault();
      removeSelectedItems();
      return;
    }
    if (event.key === "Escape") {
      closeSettings();
      closeRiskModal();
      closePromptTemplateModal();
      closePresetMenu();
      closeProductModal();
      closeProductPreview();
      closeConfirmModal();
    }
  });
  document.addEventListener("keyup", event => {
    if (event.code !== "Space") return;
    event.preventDefault();
    setSpacePanActive(false);
  });
}

async function init() {
  fillProviderOptions();
  [refs.promptApiKeyInput, refs.riskApiKeyInput, refs.imageApiKeyInput].forEach(hardenApiKeyInput);
  loadRiskLexicon();
  loadPromptTemplateSettings();
  loadCostLedger();
  bindEvents();
  await loadConfig();
  await loadProductImages();
  await initWindowFileDrop();
  renderAll();
  checkForUpdates(false);
  state.updateCheckTimer = window.setInterval(() => checkForUpdates(false), 60 * 60 * 1000);
}

init();






