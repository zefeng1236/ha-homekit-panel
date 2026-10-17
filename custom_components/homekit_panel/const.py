"""Constants for the HomeKit 风格控制面板 integration."""

import json
import os

DOMAIN = "homekit_panel"

# 侧边栏面板
PANEL_URL_PATH = "homekit"
PANEL_TITLE = "智能家居"
PANEL_ICON = "mdi:home-automation"
PANEL_COMPONENT_NAME = "homekit-panel"

with open(os.path.join(os.path.dirname(__file__), "manifest.json"), encoding="utf-8") as _f:
    MANIFEST_VERSION = json.load(_f).get("version", "0")

# panel.js 的服务地址(由本集成通过 HTTP 视图提供, 与 /local/ 一样无需认证)
# 带版本号的 query: HACS 更新后 URL 变化, 强制浏览器重新拉取, 避免旧 JS 缓存
PANEL_MODULE_URL = "/api/homekit_panel/panel.js?v=" + MANIFEST_VERSION

# 面板配置(房间/场景/天气)的存储文件名(.storage/ 下, 可视化编辑保存用)
PANEL_CONFIG_STORAGE_KEY = "homekit_panel_config"
PANEL_CONFIG_URL = "/api/homekit_panel/config"

# 配置入口标题
CONFIG_ENTRY_TITLE = "HomeKit 风格控制面板"
