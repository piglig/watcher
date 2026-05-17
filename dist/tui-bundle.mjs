// src/tui/main.js
import React16 from "react";
import { render } from "ink";

// src/tui/App.js
import React15, { useState as useState11 } from "react";
import { Box as Box14, useWindowSize } from "ink";

// src/tui/components/Header.js
import React from "react";
import { Box, Text } from "ink";

// src/tui/theme.js
var SYM = {
  logo: "\u25C6",
  check: "\u2713",
  cross: "\u2717",
  dot: "\u25CF",
  arrow: "\u203A",
  cursor: "\u276F",
  warn: "\u25B2",
  info: "\u25C8",
  run: "\u25CE",
  dash: "\u2500"
};
var RISK_COLORS = {
  critical: "red",
  high: "redBright",
  medium: "yellow",
  low: "green"
};
var RISK_LABELS = {
  critical: "\u4E25\u91CD",
  high: "\u9AD8\u98CE\u9669",
  medium: "\u4E2D\u98CE\u9669",
  low: "\u4F4E\u98CE\u9669"
};
var BATCH_COLORS = { pending: "yellow", completed: "green", failed: "red" };
var BATCH_LABELS = { pending: "\u7B49\u5F85\u4E2D", completed: "\u5DF2\u5B8C\u6210", failed: "\u5931\u8D25" };

// src/tui/components/Header.js
import { jsx, jsxs } from "react/jsx-runtime";
function Header({ subtitle = "" }) {
  return /* @__PURE__ */ jsxs(Box, { flexDirection: "column", marginBottom: 1, children: [
    /* @__PURE__ */ jsxs(Box, { gap: 2, paddingX: 1, children: [
      /* @__PURE__ */ jsxs(Box, { gap: 1, children: [
        /* @__PURE__ */ jsx(Text, { color: "cyan", bold: true, children: SYM.logo }),
        /* @__PURE__ */ jsx(Text, { bold: true, children: "SNS Audit" }),
        /* @__PURE__ */ jsx(Text, { color: "gray", dimColor: true, children: "v2.0.0" })
      ] }),
      subtitle ? /* @__PURE__ */ jsxs(Text, { color: "gray", dimColor: true, children: [
        SYM.dash,
        " ",
        subtitle
      ] }) : /* @__PURE__ */ jsxs(Text, { color: "gray", dimColor: true, children: [
        SYM.dash,
        " \u591A\u5E73\u53F0\u5185\u5BB9\u98CE\u9669\u5BA1\u67E5"
      ] })
    ] }),
    /* @__PURE__ */ jsx(Box, { paddingX: 1, children: /* @__PURE__ */ jsx(Text, { color: "gray", dimColor: true, children: "\u2500".repeat(56) }) })
  ] });
}

// src/tui/screens/MainMenu.js
import React3, { useState } from "react";
import { Box as Box3, Text as Text3, useApp, useInput } from "ink";
import SelectInput from "ink-select-input";

// src/tui/components/KeyBar.js
import React2 from "react";
import { Box as Box2, Text as Text2 } from "ink";
import { jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
function KeyBar({ hints }) {
  return /* @__PURE__ */ jsx2(Box2, { gap: 3, marginTop: 1, paddingX: 1, children: hints.map(({ key, label }) => /* @__PURE__ */ jsxs2(Box2, { gap: 1, children: [
    /* @__PURE__ */ jsxs2(Text2, { backgroundColor: "gray", color: "black", children: [
      " ",
      key,
      " "
    ] }),
    /* @__PURE__ */ jsx2(Text2, { color: "gray", dimColor: true, children: label })
  ] }, key)) });
}

// src/tui/screens/MainMenu.js
import { jsx as jsx3, jsxs as jsxs3 } from "react/jsx-runtime";
var ITEMS = [
  {
    label: "\u91C7\u96C6\u5185\u5BB9",
    value: "scrape",
    desc: "\u4ECE Twitter\u3001TikTok\u3001Reddit \u7B49\u5E73\u53F0\u6279\u91CF\u91C7\u96C6\u5E16\u5B50\uFF0C\u652F\u6301\u591A\u5E73\u53F0\u540C\u65F6\u91C7\u96C6"
  },
  {
    label: "AI \u98CE\u9669\u5206\u7C7B",
    value: "classify",
    desc: "\u4F7F\u7528 OpenAI Batch API \u5BF9\u5E16\u5B50\u8FDB\u884C\u591A\u7EF4\u5EA6\u98CE\u9669\u8BC4\u5206"
  },
  {
    label: "\u9884\u89C8\u91C7\u96C6\u6570\u636E",
    value: "preview",
    desc: "\u6D4F\u89C8\u5DF2\u91C7\u96C6\u7684 JSON \u6570\u636E\uFF0C\u2191\u2193 \u9009\u884C\uFF0C\u2190\u2192 \u7FFB\u9875"
  },
  {
    label: "\u67E5\u770B\u5206\u7C7B\u4EFB\u52A1",
    value: "jobs",
    desc: "\u67E5\u770B\u5386\u53F2\u6279\u6B21\uFF0C\u68C0\u7D22\u5DF2\u5B8C\u6210\u7684\u5206\u7C7B\u7ED3\u679C"
  },
  {
    label: "\u8BBE\u7F6E",
    value: "settings",
    desc: "\u914D\u7F6E OpenAI API Key\u3001YouTube API Key\u3001\u9ED8\u8BA4\u8F93\u51FA\u76EE\u5F55\u7B49\u53C2\u6570"
  },
  {
    label: "\u9000\u51FA",
    value: "quit",
    desc: "\u9000\u51FA SNS Audit"
  }
];
function Indicator({ isSelected }) {
  return /* @__PURE__ */ jsx3(Box3, { marginRight: 1, children: isSelected ? /* @__PURE__ */ jsx3(Text3, { color: "cyan", bold: true, children: SYM.cursor }) : /* @__PURE__ */ jsx3(Text3, { children: " " }) });
}
function Item({ label, isSelected }) {
  return /* @__PURE__ */ jsx3(Text3, { color: isSelected ? "white" : "gray", bold: isSelected, children: label });
}
function MainMenu({ onNav }) {
  const { exit } = useApp();
  const [highlighted, setHighlighted] = useState(ITEMS[0]);
  const handleSelect = ({ value }) => {
    if (value === "quit") {
      exit();
      return;
    }
    onNav(
      value === "scrape" ? "scrape-setup" : value === "classify" ? "classify-setup" : value === "preview" ? "data-preview" : value === "jobs" ? "jobs" : value === "settings" ? "settings" : "menu"
    );
  };
  useInput((_, key) => {
    if (key.escape) exit();
  });
  const current = highlighted ?? ITEMS[0];
  return /* @__PURE__ */ jsxs3(Box3, { flexDirection: "column", paddingX: 2, paddingY: 1, gap: 1, children: [
    /* @__PURE__ */ jsx3(Text3, { bold: true, color: "cyan", children: "\u8BF7\u9009\u62E9\u64CD\u4F5C" }),
    /* @__PURE__ */ jsx3(Box3, { flexDirection: "column", marginTop: 1, children: /* @__PURE__ */ jsx3(
      SelectInput,
      {
        items: ITEMS,
        onSelect: handleSelect,
        onHighlight: setHighlighted,
        indicatorComponent: Indicator,
        itemComponent: Item
      }
    ) }),
    current?.desc && /* @__PURE__ */ jsx3(
      Box3,
      {
        borderStyle: "round",
        borderColor: "gray",
        borderDimColor: true,
        paddingX: 2,
        paddingY: 0,
        marginTop: 1,
        children: /* @__PURE__ */ jsx3(Text3, { color: "gray", children: current.desc })
      }
    ),
    /* @__PURE__ */ jsx3(KeyBar, { hints: [
      { key: "\u2191\u2193", label: "\u5BFC\u822A" },
      { key: "Enter", label: "\u786E\u8BA4" },
      { key: "ESC", label: "\u9000\u51FA" }
    ] })
  ] });
}

// src/tui/screens/Settings.js
import React6, { useState as useState3 } from "react";
import { Box as Box6, Text as Text6, useInput as useInput3 } from "ink";
import TextInput2 from "ink-text-input";
import SelectInput2 from "ink-select-input";

// src/tui/components/DirPicker.js
import React4, { useState as useState2, useEffect } from "react";
import { Box as Box4, Text as Text4, useInput as useInput2 } from "ink";
import TextInput from "ink-text-input";
import { readdirSync, mkdirSync } from "fs";
import { join, resolve, dirname, sep } from "path";
import { jsx as jsx4, jsxs as jsxs4 } from "react/jsx-runtime";
var VISIBLE = 8;
function listDirs(path) {
  try {
    return readdirSync(path, { withFileTypes: true }).filter((d) => {
      try {
        return d.isDirectory();
      } catch {
        return false;
      }
    }).map((d) => d.name).sort((a, b) => a.localeCompare(b, "zh"));
  } catch {
    return [];
  }
}
function isRoot(p) {
  return dirname(p) === p;
}
function DirPicker({ initial = ".", onConfirm }) {
  const [currentPath, setCurrentPath] = useState2(() => resolve(initial || "."));
  const [cursor, setCursor] = useState2(0);
  const [creating, setCreating] = useState2(false);
  const [newName, setNewName] = useState2("");
  const [revision, setRevision] = useState2(0);
  const subdirs = listDirs(currentPath);
  const atRoot = isRoot(currentPath);
  const items = [
    { id: "__confirm", label: `${SYM.check}  \u9009\u62E9\u6B64\u76EE\u5F55`, type: "confirm" },
    { id: "__new", label: `[+] \u65B0\u5EFA\u6587\u4EF6\u5939`, type: "new-folder" },
    ...!atRoot ? [{ id: "__parent", label: `..${sep}  \u4E0A\u7EA7\u76EE\u5F55`, type: "parent" }] : [],
    ...subdirs.map((name) => ({ id: name, label: `${name}${sep}`, type: "dir", name }))
  ];
  useEffect(() => {
    setCursor(0);
  }, [currentPath]);
  useInput2((input, key) => {
    if (creating) return;
    if (key.upArrow) setCursor((c) => Math.max(0, c - 1));
    if (key.downArrow) setCursor((c) => Math.min(items.length - 1, c + 1));
    if (key.leftArrow && !atRoot) {
      setCurrentPath(dirname(currentPath));
      return;
    }
    if (key.return || key.rightArrow) {
      const item = items[cursor];
      if (!item) return;
      if (item.type === "confirm") {
        mkdirSync(currentPath, { recursive: true });
        onConfirm(currentPath);
      } else if (item.type === "new-folder") {
        setCreating(true);
        setNewName("");
      } else if (item.type === "parent") {
        setCurrentPath(dirname(currentPath));
      } else if (item.type === "dir") {
        setCurrentPath(join(currentPath, item.name));
      }
    }
  });
  const handleCreate = () => {
    const name = newName.trim();
    if (name) {
      try {
        mkdirSync(join(currentPath, name), { recursive: true });
        setRevision((r) => r + 1);
      } catch {
      }
    }
    setCreating(false);
    setNewName("");
  };
  const scrollStart = items.length <= VISIBLE ? 0 : Math.max(0, Math.min(cursor - Math.floor(VISIBLE / 2), items.length - VISIBLE));
  const visibleItems = items.slice(scrollStart, scrollStart + VISIBLE);
  return /* @__PURE__ */ jsxs4(Box4, { flexDirection: "column", gap: 0, children: [
    /* @__PURE__ */ jsx4(Text4, { color: "cyan", wrap: "truncate", children: currentPath }),
    /* @__PURE__ */ jsxs4(Box4, { flexDirection: "column", marginTop: 1, children: [
      scrollStart > 0 && /* @__PURE__ */ jsxs4(Text4, { color: "gray", dimColor: true, children: [
        "  \u2191 ",
        scrollStart,
        " \u6761\u5728\u4E0A\u65B9"
      ] }),
      visibleItems.map((item, localIdx) => {
        const globalIdx = scrollStart + localIdx;
        const isCursor = globalIdx === cursor;
        const color = item.type === "confirm" ? "green" : item.type === "new-folder" ? "yellow" : item.type === "parent" ? "gray" : "white";
        return /* @__PURE__ */ jsxs4(Box4, { gap: 1, children: [
          /* @__PURE__ */ jsx4(Text4, { color: isCursor ? "cyan" : "gray", children: isCursor ? SYM.cursor : " " }),
          /* @__PURE__ */ jsx4(
            Text4,
            {
              color: isCursor ? color : "gray",
              bold: isCursor && item.type !== "parent",
              dimColor: item.type === "parent" && !isCursor,
              children: item.label
            }
          )
        ] }, item.id);
      }),
      scrollStart + VISIBLE < items.length && /* @__PURE__ */ jsxs4(Text4, { color: "gray", dimColor: true, children: [
        "  \u2193 ",
        items.length - scrollStart - VISIBLE,
        " \u6761\u5728\u4E0B\u65B9"
      ] })
    ] }),
    creating && /* @__PURE__ */ jsxs4(Box4, { gap: 1, marginTop: 1, children: [
      /* @__PURE__ */ jsx4(Text4, { color: "yellow", children: SYM.cursor }),
      /* @__PURE__ */ jsx4(Text4, { color: "yellow", children: "\u65B0\u5EFA\u6587\u4EF6\u5939\uFF1A" }),
      /* @__PURE__ */ jsx4(
        TextInput,
        {
          value: newName,
          onChange: setNewName,
          onSubmit: handleCreate,
          placeholder: "\u8F93\u5165\u540D\u79F0\uFF0CEnter \u786E\u8BA4"
        }
      )
    ] }),
    /* @__PURE__ */ jsxs4(Box4, { marginTop: 1, gap: 2, children: [
      /* @__PURE__ */ jsx4(Text4, { color: "gray", dimColor: true, children: "\u2191\u2193 \u79FB\u52A8" }),
      /* @__PURE__ */ jsx4(Text4, { color: "gray", dimColor: true, children: "\u2190 \u4E0A\u7EA7\u76EE\u5F55" }),
      /* @__PURE__ */ jsx4(Text4, { color: "gray", dimColor: true, children: "\u2192/Enter \u8FDB\u5165\xB7\u786E\u8BA4" })
    ] })
  ] });
}

// src/tui/components/StepBar.js
import React5 from "react";
import { Box as Box5, Text as Text5 } from "ink";
import { jsx as jsx5, jsxs as jsxs5 } from "react/jsx-runtime";
function StepBar({ steps, current }) {
  return /* @__PURE__ */ jsx5(Box5, { gap: 1, flexWrap: "wrap", children: steps.map((label, i) => {
    const done = i < current;
    const active = i === current;
    return /* @__PURE__ */ jsxs5(Box5, { gap: 1, children: [
      done && /* @__PURE__ */ jsx5(Text5, { color: "green", children: SYM.check }),
      active && /* @__PURE__ */ jsx5(Text5, { color: "cyan", bold: true, children: SYM.cursor }),
      !done && !active && /* @__PURE__ */ jsx5(Text5, { color: "gray", dimColor: true, children: i + 1 }),
      /* @__PURE__ */ jsx5(
        Text5,
        {
          color: active ? "cyan" : done ? "green" : "gray",
          bold: active,
          dimColor: !active && !done,
          children: label
        }
      ),
      i < steps.length - 1 && /* @__PURE__ */ jsx5(Text5, { color: "gray", dimColor: true, children: SYM.arrow })
    ] }, i);
  }) });
}

// src/shared/config-store.js
import { readFileSync, writeFileSync, mkdirSync as mkdirSync2, existsSync } from "fs";
import { join as join2 } from "path";
import { homedir } from "os";
var CONFIG_DIR = join2(homedir(), ".sns-audit");
var CONFIG_FILE = join2(CONFIG_DIR, "config.json");
function load() {
  try {
    if (!existsSync(CONFIG_FILE)) return {};
    return JSON.parse(readFileSync(CONFIG_FILE, "utf-8"));
  } catch {
    return {};
  }
}
function save(cfg) {
  try {
    mkdirSync2(CONFIG_DIR, { recursive: true });
    writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2));
  } catch {
  }
}
function getConfig() {
  return load();
}
function setConfig(updates) {
  const cfg = { ...load(), ...updates };
  save(cfg);
  return cfg;
}
function applyToEnv() {
  const cfg = load();
  if (cfg.openaiKey && !process.env.OPENAI_API_KEY) process.env.OPENAI_API_KEY = cfg.openaiKey;
  if (cfg.youtubeKey && !process.env.YOUTUBE_API_KEY) process.env.YOUTUBE_API_KEY = cfg.youtubeKey;
}

// src/tui/screens/Settings.js
import { Fragment, jsx as jsx6, jsxs as jsxs6 } from "react/jsx-runtime";
var MODEL_ITEMS = [
  { label: "gpt-4.1-mini  \u5FEB\u901F\u7701\u94B1\uFF08\u63A8\u8350\uFF09", value: "gpt-4.1-mini" },
  { label: "gpt-4.1       \u9AD8\u7CBE\u5EA6", value: "gpt-4.1" },
  { label: "gpt-4o-mini   \u5907\u7528", value: "gpt-4o-mini" }
];
var STEPS = [
  { key: "openaiKey", label: "OpenAI API Key", hint: "\u4EE5 sk- \u5F00\u5934\uFF1B\u7559\u7A7A\u4FDD\u6301\u73B0\u6709\u503C\u4E0D\u53D8", mask: true, type: "text" },
  { key: "youtubeKey", label: "YouTube API Key", hint: "\u4EC5\u91C7\u96C6 YouTube \u65F6\u9700\u8981\uFF1B\u7559\u7A7A\u8DF3\u8FC7", mask: true, type: "text" },
  { key: "outDir", label: "\u9ED8\u8BA4\u8F93\u51FA\u76EE\u5F55", mask: false, type: "dir" },
  { key: "model", label: "\u9ED8\u8BA4 AI \u6A21\u578B", mask: false, type: "select", items: MODEL_ITEMS }
];
var STEP_LABELS = ["OpenAI", "YouTube", "\u76EE\u5F55", "\u6A21\u578B"];
function maskValue(val) {
  if (!val || val.length <= 8) return "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022";
  return val.slice(0, 4) + "\u2022".repeat(Math.min(val.length - 8, 16)) + val.slice(-4);
}
function Settings({ onNav }) {
  const saved = getConfig();
  const [stepIdx, setStepIdx] = useState3(0);
  const [draft, setDraft] = useState3("");
  const [values, setValues] = useState3({
    openaiKey: saved.openaiKey ?? "",
    youtubeKey: saved.youtubeKey ?? "",
    outDir: saved.outDir ?? "",
    model: saved.model ?? ""
  });
  const step = STEPS[stepIdx];
  useInput3((_, key) => {
    if (key.escape) {
      if (stepIdx === 0) onNav("menu");
      else {
        setStepIdx((i) => i - 1);
        setDraft("");
      }
      return;
    }
    if (step?.type !== "dir") {
      if (key.leftArrow && stepIdx > 0) {
        setStepIdx((i) => i - 1);
        setDraft("");
      }
      if (key.rightArrow && step?.type === "text") {
        advance();
      }
    }
  });
  const advance = (overrideVal) => {
    const val = overrideVal !== void 0 ? String(overrideVal) : draft.trim();
    const next = { ...values, [step.key]: val || values[step.key] };
    setValues(next);
    setDraft("");
    if (stepIdx + 1 >= STEPS.length) {
      const toSave = {};
      if (next.openaiKey) toSave.openaiKey = next.openaiKey;
      if (next.youtubeKey) toSave.youtubeKey = next.youtubeKey;
      if (next.outDir) toSave.outDir = next.outDir;
      if (next.model) toSave.model = next.model;
      const cfg = setConfig(toSave);
      if (cfg.openaiKey) process.env.OPENAI_API_KEY = cfg.openaiKey;
      if (cfg.youtubeKey) process.env.YOUTUBE_API_KEY = cfg.youtubeKey;
      onNav("menu");
    } else {
      setStepIdx((i) => i + 1);
    }
  };
  const doneSteps = STEPS.slice(0, stepIdx);
  return /* @__PURE__ */ jsxs6(Box6, { flexDirection: "column", paddingX: 2, paddingY: 1, gap: 1, children: [
    /* @__PURE__ */ jsx6(Text6, { bold: true, color: "cyan", children: "\u8BBE\u7F6E" }),
    /* @__PURE__ */ jsx6(StepBar, { steps: STEP_LABELS, current: stepIdx }),
    doneSteps.length > 0 && /* @__PURE__ */ jsx6(Box6, { flexDirection: "column", borderStyle: "round", borderColor: "green", borderDimColor: true, paddingX: 2, children: doneSteps.map((s) => /* @__PURE__ */ jsxs6(Box6, { gap: 2, children: [
      /* @__PURE__ */ jsx6(Text6, { color: "green", children: SYM.check }),
      /* @__PURE__ */ jsx6(Text6, { color: "gray", dimColor: true, children: s.label.padEnd(18) }),
      /* @__PURE__ */ jsx6(Text6, { color: "white", wrap: "truncate", children: values[s.key] ? s.mask ? maskValue(values[s.key]) : values[s.key] : "\uFF08\u8DF3\u8FC7\uFF09" })
    ] }, s.key)) }),
    /* @__PURE__ */ jsxs6(
      Box6,
      {
        flexDirection: "column",
        borderStyle: "round",
        borderColor: "cyan",
        paddingX: 2,
        paddingY: 0,
        marginTop: 1,
        gap: 1,
        children: [
          /* @__PURE__ */ jsx6(Text6, { bold: true, color: "cyan", children: step.label }),
          step.hint && /* @__PURE__ */ jsx6(Text6, { color: "gray", dimColor: true, children: step.hint }),
          step.type === "dir" ? /* @__PURE__ */ jsx6(
            DirPicker,
            {
              initial: values[step.key] || ".",
              onConfirm: (path) => advance(path)
            }
          ) : step.type === "select" ? /* @__PURE__ */ jsxs6(Fragment, { children: [
            values[step.key] && /* @__PURE__ */ jsxs6(Text6, { color: "gray", dimColor: true, children: [
              "\u5F53\u524D\u503C\uFF1A",
              MODEL_ITEMS.find((m) => m.value === values[step.key])?.label ?? values[step.key]
            ] }),
            /* @__PURE__ */ jsx6(
              SelectInput2,
              {
                items: step.items,
                onSelect: ({ value }) => advance(value),
                indicatorComponent: ({ isSelected }) => /* @__PURE__ */ jsx6(Box6, { marginRight: 1, children: isSelected ? /* @__PURE__ */ jsx6(Text6, { color: "cyan", bold: true, children: SYM.cursor }) : /* @__PURE__ */ jsx6(Text6, { children: " " }) }),
                itemComponent: ({ label, isSelected }) => /* @__PURE__ */ jsx6(Text6, { color: isSelected ? "white" : "gray", children: label })
              }
            )
          ] }) : /* @__PURE__ */ jsxs6(Fragment, { children: [
            values[step.key] && /* @__PURE__ */ jsxs6(Text6, { color: "gray", dimColor: true, children: [
              "\u5F53\u524D\u503C\uFF1A",
              step.mask ? maskValue(values[step.key]) : values[step.key]
            ] }),
            /* @__PURE__ */ jsxs6(Box6, { gap: 1, children: [
              /* @__PURE__ */ jsx6(Text6, { color: "cyan", children: SYM.cursor }),
              /* @__PURE__ */ jsx6(
                TextInput2,
                {
                  value: draft,
                  onChange: setDraft,
                  onSubmit: () => advance(),
                  placeholder: step.hint ?? ""
                }
              )
            ] })
          ] })
        ]
      }
    ),
    /* @__PURE__ */ jsx6(KeyBar, { hints: step.type === "dir" ? [{ key: "ESC", label: stepIdx === 0 ? "\u8FD4\u56DE\u83DC\u5355" : "\u4E0A\u4E00\u6B65" }] : step.type === "select" ? [{ key: "\u2190", label: "\u4E0A\u4E00\u9879" }, { key: "Enter", label: "\u9009\u62E9" }, { key: "ESC", label: stepIdx === 0 ? "\u8FD4\u56DE\u83DC\u5355" : "\u4E0A\u4E00\u6B65" }] : [{ key: "\u2190\u2192", label: "\u5207\u6362\u914D\u7F6E\u9879" }, { key: "Enter", label: "\u786E\u8BA4" }, { key: "ESC", label: stepIdx === 0 ? "\u8FD4\u56DE\u83DC\u5355" : "\u4E0A\u4E00\u6B65" }] })
  ] });
}

// src/tui/screens/ScrapeSetup.js
import React8, { useState as useState5, useMemo } from "react";
import { Box as Box8, Text as Text8, useInput as useInput5 } from "ink";
import TextInput3 from "ink-text-input";
import SelectInput3 from "ink-select-input";

// src/tui/components/MultiSelect.js
import React7, { useState as useState4 } from "react";
import { Box as Box7, Text as Text7, useInput as useInput4 } from "ink";
import { jsx as jsx7, jsxs as jsxs7 } from "react/jsx-runtime";
function MultiSelect({ items, onConfirm }) {
  const [cursor, setCursor] = useState4(0);
  const [selected, setSelected] = useState4(/* @__PURE__ */ new Set());
  useInput4((input, key) => {
    if (key.upArrow) setCursor((c) => Math.max(0, c - 1));
    if (key.downArrow) setCursor((c) => Math.min(items.length - 1, c + 1));
    if (input === " ") {
      const val = items[cursor].value;
      setSelected((prev) => {
        const next = new Set(prev);
        next.has(val) ? next.delete(val) : next.add(val);
        return next;
      });
    }
    if (key.return && selected.size > 0) {
      onConfirm(items.map((i) => i.value).filter((v) => selected.has(v)));
    }
  });
  return /* @__PURE__ */ jsxs7(Box7, { flexDirection: "column", children: [
    items.map((item, i) => {
      const isCursor = i === cursor;
      const isSelected = selected.has(item.value);
      return /* @__PURE__ */ jsxs7(Box7, { gap: 1, children: [
        /* @__PURE__ */ jsx7(Text7, { color: isCursor ? "cyan" : "gray", children: isCursor ? SYM.cursor : " " }),
        /* @__PURE__ */ jsx7(Text7, { color: isSelected ? "cyan" : "gray", children: isSelected ? "\u25C9" : "\u25CB" }),
        /* @__PURE__ */ jsx7(
          Text7,
          {
            color: isCursor ? "white" : isSelected ? "cyan" : "gray",
            bold: isCursor,
            children: item.label
          }
        )
      ] }, item.value);
    }),
    /* @__PURE__ */ jsx7(Box7, { marginTop: 1, children: /* @__PURE__ */ jsx7(Text7, { color: "gray", dimColor: true, children: "Space \u5207\u6362\u9009\u62E9   Enter \u786E\u8BA4\uFF08\u81F3\u5C11\u9009\u4E00\u9879\uFF09" }) })
  ] });
}

// src/tui/runner.js
import { writeFileSync as writeFileSync5, mkdirSync as mkdirSync7 } from "fs";
import { join as join5, resolve as resolve8 } from "path";

// src/platforms/twitter/scrape.js
import { resolve as resolve2 } from "path";
import { existsSync as existsSync3, readFileSync as readFileSync2, rmSync as rmSync2 } from "fs";

// src/shared/browser.js
import { launchPersistentContext } from "cloakbrowser";
import { existsSync as existsSync2, mkdirSync as mkdirSync3, rmSync } from "fs";
import { join as join3 } from "path";
import { createInterface } from "readline";
var BLOCKED_TYPES = /* @__PURE__ */ new Set(["image", "stylesheet", "font", "media"]);
async function createBrowser(sessionDir, { headless = true, debug = false, viewport = null } = {}) {
  if (!existsSync2(sessionDir)) mkdirSync3(sessionDir, { recursive: true });
  const context = await launchPersistentContext({
    userDataDir: sessionDir,
    headless,
    humanize: true,
    ...viewport ? { viewport } : {}
  });
  return context;
}
async function setupPage(context) {
  const page = await context.newPage();
  await page.route("**/*", (route) => {
    if (BLOCKED_TYPES.has(route.request().resourceType())) {
      return route.abort();
    }
    return route.continue();
  });
  return page;
}
async function isLoggedIn(page) {
  try {
    return await page.evaluate(() => !!(document.querySelector('[data-testid="SideNav_NewTweet_Button"]') || document.querySelector('[data-testid="AppTabBar_Profile_Link"]') || document.querySelector('[data-testid="tweetButtonInline"]')));
  } catch {
    return false;
  }
}
async function waitForLogin(page, username) {
  console.log("\nNot logged in. Please log in to Twitter/X in the browser window.");
  console.log("\u2500".repeat(50));
  console.log("  After login completes \u2192 press Enter here to continue");
  console.log("\u2500".repeat(50));
  const success = await Promise.race([
    // Auto-detect: URL leaves login flow AND session is confirmed active
    (async () => {
      const deadline = Date.now() + 18e4;
      while (Date.now() < deadline) {
        await page.waitForTimeout(1500);
        const url = page.url();
        const onLoginPage = url.includes("/login") || url.includes("/i/flow") || url.includes("/signup") || url.includes("apple.com") || url.includes("appleid.apple.com");
        const onTwitter = url.includes("x.com") || url.includes("twitter.com");
        if (!onLoginPage && onTwitter && await isLoggedIn(page)) return true;
      }
      return false;
    })(),
    // Manual fallback: user presses Enter
    new Promise((res) => {
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      rl.question("", () => {
        rl.close();
        res(true);
      });
    })
  ]);
  return success;
}
function clearSession(sessionDir) {
  if (existsSync2(sessionDir)) {
    rmSync(sessionDir, { recursive: true, force: true });
  }
}
function sessionExists(sessionDir) {
  return existsSync2(join3(sessionDir, "Default"));
}

// src/platforms/twitter/interceptor.js
function validateGraphQLResponse(json) {
  if (json?.errors?.length) {
    return { valid: false, reason: `API errors: ${json.errors.map((e) => e.message).join("; ")}` };
  }
  const instructions = json?.data?.user?.result?.timeline_v2?.timeline?.instructions ?? json?.data?.user?.result?.timeline?.timeline?.instructions;
  if (!instructions) {
    return { valid: false, reason: "Unrecognised response shape \u2014 Twitter may have changed their API" };
  }
  const types = instructions.map((i) => i.type);
  if (types.includes("TimelineTerminateTimeline") && !types.includes("TimelineAddEntries")) {
    return { valid: false, reason: "TimelineTerminateTimeline without entries \u2014 session likely expired or access denied" };
  }
  return { valid: true, reason: null };
}
function unwrapTweetResult(raw) {
  return raw?.tweet ?? raw;
}
function parseTweetResult(raw) {
  if (!raw) return null;
  const result = unwrapTweetResult(raw);
  if (result.__typename === "TweetTombstone") return null;
  const tweetId = result.rest_id;
  const tweetData = result.legacy;
  if (!tweetId || !tweetData) return null;
  const userData = result.core?.user_results?.result?.legacy ?? {};
  const views = parseInt(result.views?.count ?? "0", 10) || 0;
  let text = tweetData.full_text ?? tweetData.text ?? "";
  let rtFrom = null;
  if (tweetData.retweeted_status_result) {
    const origResult = unwrapTweetResult(tweetData.retweeted_status_result);
    const origLegacy = origResult?.legacy ?? {};
    const origUser = origResult?.core?.user_results?.result?.legacy ?? {};
    if (origLegacy.full_text) text = origLegacy.full_text;
    rtFrom = {
      tweet_id: origResult?.rest_id ?? null,
      username: origUser.screen_name ?? null
    };
  }
  return {
    id: tweetId,
    authorId: tweetData.user_id_str ?? null,
    // numeric author ID from legacy; used for ownership filtering
    platform: "twitter",
    url: userData.screen_name ? `https://x.com/${userData.screen_name}/status/${tweetId}` : `https://x.com/i/web/status/${tweetId}`,
    text,
    created_at: tweetData.created_at ? new Date(tweetData.created_at).toISOString() : null,
    author: {
      id: userData.id_str,
      username: userData.screen_name,
      name: userData.name,
      verified: userData.verified ?? false,
      followers: userData.followers_count ?? 0
    },
    metrics: {
      replies: tweetData.reply_count ?? 0,
      retweets: tweetData.retweet_count ?? 0,
      likes: tweetData.favorite_count ?? 0,
      quotes: tweetData.quote_count ?? 0,
      views
    },
    media: extractMedia(tweetData),
    type: tweetData.retweeted_status_result ? "retweet" : tweetData.in_reply_to_status_id_str ? "reply" : result.quoted_status_result ? "quote" : "tweet",
    lang: tweetData.lang,
    rt_from: rtFrom
    // { tweet_id, username } for retweets; null otherwise
  };
}
function extractMedia(legacy) {
  const media = legacy?.extended_entities?.media ?? legacy?.entities?.media ?? [];
  return media.map((m) => ({
    type: m.type,
    url: m.media_url_https,
    preview: m.type === "video" ? m.media_url_https : void 0
  }));
}
function extractFromGraphQL(json) {
  const results = [];
  try {
    const tl = json?.data?.user?.result?.timeline_v2?.timeline ?? json?.data?.user?.result?.timeline?.timeline;
    for (const inst of tl?.instructions ?? []) {
      if (inst.type !== "TimelineAddEntries") continue;
      for (const entry of inst.entries ?? []) {
        const r1 = entry?.content?.itemContent?.tweet_results?.result;
        const t1 = parseTweetResult(r1);
        if (t1) results.push(t1);
        for (const item of entry?.content?.items ?? []) {
          const r2 = item?.item?.itemContent?.tweet_results?.result;
          const t2 = parseTweetResult(r2);
          if (t2) results.push(t2);
        }
      }
    }
  } catch {
  }
  return results;
}
function attachInterceptor(page, tweetMap, state, opts = {}) {
  const { debug = false } = opts;
  const dbg = (...m) => debug && console.log("[DBG]", ...m);
  page.on("response", async (response) => {
    const url = response.url();
    const status = response.status();
    if (status === 429) {
      const retryAfter = parseInt(response.headers()["retry-after"] ?? "60", 10);
      state.rateLimitUntil = Date.now() + retryAfter * 1e3;
      console.warn(`[WARN] Rate limit \u2014 pausing ${retryAfter}s...`);
      return;
    }
    if (debug && url.includes("/api/graphql/")) {
      const name = url.split("/").slice(-1)[0].split("?")[0];
      dbg(`graphql: ${name} [${status}]`);
    }
    if (!url.includes("UserTweets") && !url.includes("UserTweetsAndReplies")) return;
    if (status !== 200) return;
    try {
      const text = await response.text();
      const json = JSON.parse(text);
      if (debug && !state.dumpedOnce) {
        state.dumpedOnce = true;
        const { writeFileSync: writeFileSync9 } = await import("fs");
        const { resolve: resolve14 } = await import("path");
        writeFileSync9(resolve14("debug_response.json"), JSON.stringify(json, null, 2), "utf-8");
        dbg("Raw response \u2192 debug_response.json");
      }
      const { valid, reason } = validateGraphQLResponse(json);
      if (!valid) {
        state.emptyResponseCount = (state.emptyResponseCount ?? 0) + 1;
        if (!state.schemaWarned) {
          state.schemaWarned = true;
          console.warn(`
[WARN] GraphQL schema issue: ${reason}`);
          if (state.emptyResponseCount >= 3) {
            console.error("[ERROR] 3 consecutive invalid responses \u2014 session may have expired.");
            state.sessionExpired = true;
          }
        }
        return;
      }
      state.emptyResponseCount = 0;
      state.schemaWarned = false;
      const found = extractFromGraphQL(json);
      dbg(`UserTweets parsed \u2192 ${found.length} tweets`);
      for (const t of found) {
        if (!tweetMap.has(t.id)) tweetMap.set(t.id, t);
      }
    } catch (e) {
      dbg("Parse error:", e.message);
    }
  });
}

// src/platforms/twitter/extract.js
async function extractFromDOM(page) {
  return page.evaluate(() => {
    const articles = Array.from(document.querySelectorAll('article[data-testid="tweet"]'));
    return articles.map((article) => {
      const timeEl = article.querySelector("time");
      const timeLink = timeEl ? timeEl.closest('a[href*="/status/"]') ?? article.querySelector('a[href*="/status/"]') : article.querySelector('a[href*="/status/"]');
      const href = timeLink?.getAttribute("href") ?? "";
      const idMatch = href.match(/\/status\/(\d+)/);
      const tweetId = idMatch?.[1] ?? "";
      const urlUsername = href.match(/^\/([^/]+)\/status\//)?.[1] ?? "";
      const userLink = urlUsername ? null : article.querySelector('a[href^="/"][role="link"]');
      const username = urlUsername || (userLink?.getAttribute("href")?.replace(/^\//, "") ?? "");
      const textEl = article.querySelector('[data-testid="tweetText"]');
      const getStat = (testId) => {
        const btn = article.querySelector(`[data-testid="${testId}"]`);
        const label = btn?.getAttribute("aria-label") ?? "";
        const num = label.match(/[\d,]+/)?.[0]?.replace(/,/g, "");
        return num ? parseInt(num, 10) : 0;
      };
      return {
        id: tweetId,
        url: tweetId ? `https://x.com/${username}/status/${tweetId}` : "",
        text: textEl?.innerText ?? "",
        created_at: timeEl?.getAttribute("datetime") ?? "",
        author: { username },
        metrics: {
          replies: getStat("reply"),
          retweets: getStat("retweet"),
          likes: getStat("like"),
          quotes: 0,
          views: getStat("analyticsButton")
        },
        media: [],
        is_retweet: !!article.querySelector('[data-testid="socialContext"]'),
        is_quote: false,
        is_reply: false,
        lang: ""
      };
    }).filter((t) => t.id);
  });
}

// src/platforms/twitter/scroll.js
import { writeFileSync as writeFileSync2 } from "fs";
async function scrollTab(page, tabUrl, label, tweetMap, state, opts = {}) {
  const { maxTweets = 200, progressFile = null, shouldStop = () => false, debug = false } = opts;
  const dbg = (...m) => debug && console.log("[DBG]", ...m);
  console.log(`
[${label}] \u2192 ${tabUrl}`);
  await page.goto(tabUrl, { waitUntil: "domcontentloaded", timeout: 6e4 });
  await page.waitForTimeout(2e3);
  try {
    await page.waitForSelector('article[data-testid="tweet"]', { timeout: 2e4 });
  } catch {
    console.warn(`[${label}] No tweet articles after 20s \u2014 skipping.`);
    return;
  }
  let staleRounds = 0;
  let prevCount = tweetMap.size;
  let round = 0;
  while (tweetMap.size < maxTweets && staleRounds < 5) {
    round++;
    if (state.sessionExpired) {
      console.error("\n[ERROR] Session expired during scrape. Re-run with --headed to re-login.");
      break;
    }
    const pause = (state.rateLimitUntil ?? 0) - Date.now();
    if (pause > 0) {
      console.warn(`[WARN] Rate limit \u2014 waiting ${Math.ceil(pause / 1e3)}s...`);
      await page.waitForTimeout(pause);
    }
    const domTweets = await extractFromDOM(page);
    dbg(`[${label}] DOM articles: ${domTweets.length}`);
    for (const t of domTweets) {
      if (!tweetMap.has(t.id)) tweetMap.set(t.id, t);
    }
    console.log(`[${label}] ${tweetMap.size} tweets (scroll #${round})`);
    if (shouldStop(domTweets)) {
      console.log(`
  [${label}] All tweets older than --since cutoff. Stopping early.`);
      break;
    }
    if (progressFile && tweetMap.size > prevCount) {
      const snapshot = Array.from(tweetMap.values()).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      writeFileSync2(progressFile, JSON.stringify(snapshot, null, 2), "utf-8");
      dbg(`Progress saved (${tweetMap.size})`);
    }
    await page.evaluate(
      () => window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" })
    );
    await Promise.race([
      page.waitForLoadState("networkidle", { timeout: 6e3 }).catch(() => {
      }),
      page.waitForTimeout(6e3)
    ]);
    if (tweetMap.size === prevCount) {
      staleRounds++;
      if (staleRounds === 2) {
        dbg(`[${label}] Nudging scroll...`);
        await page.evaluate(() => window.scrollBy(0, -400));
        await page.waitForTimeout(500);
        await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight }));
        await page.waitForTimeout(1e3);
      }
    } else {
      staleRounds = 0;
      prevCount = tweetMap.size;
    }
    const endOfLine = await page.evaluate(
      () => document.body.innerText.includes("You've reached the end")
    );
    if (endOfLine) {
      console.log(`
  [${label}] Reached end of timeline.`);
      break;
    }
  }
}

// src/platforms/twitter/filter.js
function buildFilter(opts = {}) {
  const since = opts.since ? new Date(opts.since) : null;
  const until = opts.until ? new Date(opts.until) : null;
  const keyword = opts.keyword ? opts.keyword.toLowerCase() : null;
  return function applyFilter(tweet) {
    if (since || until) {
      const d = new Date(tweet.created_at);
      if (since && d < since) return false;
      if (until && d > until) return false;
    }
    if (opts.noRetweets && tweet.is_retweet) return false;
    if (opts.noReplies && tweet.is_reply) return false;
    if (keyword && !tweet.text.toLowerCase().includes(keyword)) return false;
    return true;
  };
}
function buildEarlyStop(opts = {}) {
  if (!opts.since) return () => false;
  const since = new Date(opts.since);
  return function shouldStop(tweets) {
    return tweets.length > 0 && tweets.every((t) => new Date(t.created_at) < since);
  };
}

// src/platforms/twitter/scrape.js
function parseUsername(raw) {
  const urlMatch = raw.match(/(?:twitter\.com|x\.com)\/@?([A-Za-z0-9_]+)/);
  if (urlMatch) return urlMatch[1];
  return raw.replace(/^@/, "").trim() || null;
}
function loadProgress(progressFile) {
  if (!progressFile || !existsSync3(progressFile)) return /* @__PURE__ */ new Map();
  try {
    const saved = JSON.parse(readFileSync2(progressFile, "utf-8"));
    const map = /* @__PURE__ */ new Map();
    for (const t of saved) map.set(t.id, t);
    console.log(`Resuming from ${map.size} previously saved tweets.`);
    return map;
  } catch {
    return /* @__PURE__ */ new Map();
  }
}
async function scrapeUser(username, context, opts = {}) {
  const {
    max = 200,
    debug = false,
    noRetweets = false,
    noReplies = false,
    since = null,
    until = null,
    keyword = null,
    progressFile = null
  } = opts;
  const profileUrl = `https://x.com/${username}`;
  console.log(`
${"\u2550".repeat(52)}`);
  console.log(`  @${username}`);
  console.log(`${"\u2550".repeat(52)}`);
  const tweetMap = loadProgress(progressFile);
  const state = {
    rateLimitUntil: 0,
    emptyResponseCount: 0,
    sessionExpired: false,
    schemaWarned: false,
    dumpedOnce: false
  };
  const filterFn = buildFilter({ since, until, noRetweets, noReplies, keyword });
  const shouldStop = buildEarlyStop({ since });
  const [page1, page2] = await Promise.all([
    setupPage(context),
    setupPage(context)
  ]);
  attachInterceptor(page1, tweetMap, state, { debug });
  attachInterceptor(page2, tweetMap, state, { debug });
  try {
    await page1.goto(profileUrl, { waitUntil: "domcontentloaded", timeout: 6e4 });
    await page1.waitForTimeout(3e3);
    const bodyText = await page1.evaluate(() => document.body.innerText);
    if (bodyText.includes("This account doesn't exist") || bodyText.includes("Account suspended")) {
      console.error(`[ERROR] @${username} not found or suspended.`);
      return [];
    }
    const scrollOpts = { maxTweets: max, progressFile, shouldStop, debug };
    await Promise.all([
      scrollTab(page1, profileUrl, "Tweets", tweetMap, state, scrollOpts),
      scrollTab(page2, `${profileUrl}/with_replies`, "Tweets & Replies", tweetMap, state, scrollOpts)
    ]);
  } finally {
    await Promise.all([page1.close(), page2.close()]);
  }
  if (progressFile && existsSync3(progressFile)) rmSync2(progressFile);
  const idCount = /* @__PURE__ */ new Map();
  for (const t of tweetMap.values()) {
    if (t.authorId) idCount.set(t.authorId, (idCount.get(t.authorId) ?? 0) + 1);
  }
  const targetUserId = idCount.size ? [...idCount.entries()].sort((a, b) => b[1] - a[1])[0][0] : null;
  for (const tweet of tweetMap.values()) {
    const isOwned = targetUserId ? tweet.authorId === targetUserId : !tweet.author?.username;
    if (isOwned || tweet.type === "retweet") {
      tweet.author = { ...tweet.author, username };
    }
    if (tweet.url.includes("/i/web/status/") && tweet.author?.username) {
      tweet.url = `https://x.com/${tweet.author.username}/status/${tweet.id}`;
    }
  }
  const lc = username.toLowerCase();
  return Array.from(tweetMap.values()).filter((t) => {
    if (targetUserId && t.authorId) return t.authorId === targetUserId;
    return !t.author?.username || t.author.username.toLowerCase() === lc;
  }).filter(filterFn).sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, max);
}
async function scrape(usernames, opts = {}) {
  const names = (Array.isArray(usernames) ? usernames : [usernames]).map(parseUsername).filter(Boolean);
  if (!names.length) throw new Error("No valid username provided.");
  const {
    headed = false,
    debug = false,
    resetSession = false,
    sessionDir = resolve2(".session-twitter"),
    ...userOpts
  } = opts;
  if (resetSession) clearSession(sessionDir);
  if (!sessionExists(sessionDir) && !headed) {
    throw new Error("No saved session. Call scrape() with headed: true to log in first.");
  }
  const context = await createBrowser(sessionDir, { headless: !headed, debug });
  try {
    const checkPage = await setupPage(context);
    await checkPage.goto("https://x.com", { waitUntil: "domcontentloaded", timeout: 6e4 });
    await checkPage.waitForTimeout(3e3);
    const loggedIn = await isLoggedIn(checkPage);
    if (!loggedIn) {
      if (headed) {
        const ok = await waitForLogin(checkPage, names[0]);
        if (!ok) throw new Error("Login timed out.");
        const verified = await isLoggedIn(checkPage);
        if (!verified) throw new Error("Login could not be verified. Please complete login and try again.");
        console.log("\nLogin confirmed. Starting scrape...");
      } else {
        throw new Error("Session expired. Run with --headed to re-login.");
      }
    } else {
      console.log("Session active.");
    }
    await checkPage.close();
    const results = {};
    for (const username of names) {
      results[username] = await scrapeUser(username, context, userOpts);
    }
    return results;
  } finally {
    await context.close();
  }
}

// src/platforms/twitter/output.js
function toJSON(profile, tweets) {
  return JSON.stringify({ profile, tweets }, null, 2);
}

// src/platforms/tiktok/scraper.js
import { resolve as resolve3 } from "path";
import { createInterface as createInterface2 } from "readline";
import { existsSync as existsSync4, mkdirSync as mkdirSync4, rmSync as rmSync3 } from "fs";
import { launchPersistentContext as launchPersistentContext2 } from "cloakbrowser";
var DEFAULT_SESSION_DIR = resolve3(".session-tiktok");
var NAV_DELAY = 3e3;
var SCROLL_ROUNDS = 8;
var SCROLL_DELAY = 600;
var COMMENT_CONCURRENCY = 3;
var delay = (ms) => new Promise((r) => setTimeout(r, ms));
function parseTikTokUser(raw) {
  if (typeof raw !== "string") return null;
  raw = raw.trim();
  const urlMatch = raw.match(/tiktok\.com\/@?([A-Za-z0-9._]+)/);
  if (urlMatch) return { username: urlMatch[1] };
  const handleMatch = raw.match(/^@?([A-Za-z0-9._]+)$/);
  if (handleMatch) return { username: handleMatch[1] };
  return null;
}
function sessionExists2(dir) {
  return existsSync4(resolve3(dir, "Default"));
}
async function createBrowser2(sessionDir, headless) {
  mkdirSync4(sessionDir, { recursive: true });
  return launchPersistentContext2({ userDataDir: sessionDir, headless, humanize: true });
}
async function setupPage2(context) {
  const page = await context.newPage();
  await page.route("**/*", (route) => {
    const t = route.request().resourceType();
    if (t === "image" || t === "media" || t === "font") return route.abort();
    return route.continue();
  });
  return page;
}
async function setupCommentPage(context) {
  const page = await context.newPage();
  await page.route("**/*", (route) => {
    const t = route.request().resourceType();
    if (t === "font") return route.abort();
    return route.continue();
  });
  return page;
}
async function isLoggedInTikTok(page) {
  try {
    const cookies = await page.context().cookies();
    return cookies.some((c) => c.name === "sessionid" && c.value);
  } catch {
    return false;
  }
}
async function waitForLogin2(page) {
  console.log("\nNot logged in. Please log in to TikTok in the browser window.");
  console.log("\u2500".repeat(50));
  console.log("  After login completes \u2192 press Enter here to confirm");
  console.log("\u2500".repeat(50));
  return Promise.race([
    (async () => {
      const deadline = Date.now() + 18e4;
      while (Date.now() < deadline) {
        await delay(2e3);
        if (await isLoggedInTikTok(page)) return true;
      }
      return false;
    })(),
    new Promise((res) => {
      const rl = createInterface2({ input: process.stdin, output: process.stdout });
      rl.question("", async () => {
        rl.close();
        res(await isLoggedInTikTok(page));
      });
    })
  ]);
}
function extractUserFromSSR(ssrData) {
  try {
    const scope = ssrData?.["__DEFAULT_SCOPE__"];
    const info = scope?.["webapp.user-detail"]?.userInfo ?? scope?.["seo.abtest"]?.userInfo ?? null;
    if (!info?.user) return null;
    const u = info.user;
    const s = info.stats ?? {};
    return {
      id: u.id ?? "",
      username: u.uniqueId ?? "",
      nickname: u.nickname ?? "",
      bio: u.signature ?? "",
      verified: u.verified ?? false,
      private: u.privateAccount ?? false,
      followers: s.followerCount ?? 0,
      following: s.followingCount ?? 0,
      total_likes: s.heart ?? s.heartCount ?? 0,
      video_count: s.videoCount ?? 0,
      platform: "tiktok"
    };
  } catch {
    return null;
  }
}
function parseVideo(item) {
  if (!item?.id) return null;
  const s = item.stats ?? item.statsV2 ?? {};
  const a = item.author ?? {};
  const m = item.music ?? {};
  const hashtags = (item.textExtra ?? []).filter((t) => t.hashtagName).map((t) => t.hashtagName);
  const v = item.video ?? {};
  return {
    id: item.id,
    url: `https://www.tiktok.com/@${a.uniqueId}/video/${item.id}`,
    thumbnail: v.originCover ?? v.cover ?? "",
    download_url: v.playAddr ?? v.downloadAddr ?? "",
    description: item.desc ?? "",
    created_at: item.createTime ? new Date(item.createTime * 1e3).toISOString() : null,
    author: {
      id: a.id ?? "",
      username: a.uniqueId ?? "",
      nickname: a.nickname ?? "",
      verified: a.verified ?? false
    },
    metrics: {
      views: Number(s.playCount ?? 0),
      likes: Number(s.diggCount ?? 0),
      comments: Number(s.commentCount ?? 0),
      shares: Number(s.shareCount ?? 0),
      bookmarks: Number(s.collectCount ?? 0)
    },
    music: {
      id: m.id ?? "",
      title: m.title ?? "",
      author: m.authorName ?? ""
    },
    hashtags,
    platform: "tiktok"
  };
}
function parseComment(c, videoId) {
  if (!c?.cid) return null;
  const u = c.user ?? {};
  return {
    id: c.cid,
    video_id: videoId,
    text: c.text ?? "",
    created_at: c.create_time ? new Date(c.create_time * 1e3).toISOString() : null,
    author: {
      id: u.uid ?? "",
      username: u.unique_id ?? "",
      nickname: u.nickname ?? ""
    },
    metrics: {
      likes: c.digg_count ?? 0,
      replies: c.reply_comment_total ?? 0
    },
    author_reply: null,
    // filled in by fetchAuthorReplies if replies exist
    platform: "tiktok"
  };
}
function parseReply(r) {
  if (!r?.cid) return null;
  const u = r.user ?? {};
  return {
    id: r.cid,
    text: r.text ?? "",
    created_at: r.create_time ? new Date(r.create_time * 1e3).toISOString() : null,
    author: {
      id: u.uid ?? "",
      username: u.unique_id ?? "",
      nickname: u.nickname ?? ""
    }
  };
}
function buildFilter2(opts = {}) {
  const since = opts.since ? new Date(opts.since) : null;
  const until = opts.until ? new Date(opts.until) : null;
  const keyword = opts.keyword ? opts.keyword.toLowerCase() : null;
  return (p) => {
    if (since || until) {
      const d = new Date(p.created_at);
      if (since && d < since) return false;
      if (until && d > until) return false;
    }
    if (keyword && !(p.description ?? p.text ?? "").toLowerCase().includes(keyword)) return false;
    return true;
  };
}
async function scrollForVideos(page, videoMap, { max, debug, state }) {
  const dbg = (...m) => debug && console.log("[DBG]", ...m);
  let stale = 0;
  while (videoMap.size < max && stale < 4) {
    const prev = videoMap.size;
    for (let i = 0; i < SCROLL_ROUNDS; i++) {
      await page.mouse.wheel(0, 700);
      await delay(200);
    }
    await delay(SCROLL_DELAY);
    if (videoMap.size === prev) {
      stale++;
      if (!state.hasMore) break;
    } else {
      stale = 0;
    }
    console.log(`Videos collected: ${videoMap.size}`);
    dbg(`scroll \u2014 videos: ${videoMap.size}, stale: ${stale}, hasMore: ${state.hasMore}`);
  }
  if (state.hasMore && videoMap.size < max) await delay(2e3);
}
async function fetchCommentsOnPage(page, videoId, username, maxComments, debug) {
  const dbg = (...m) => debug && console.log("[DBG]", ...m);
  const comments = [];
  const seen = /* @__PURE__ */ new Set();
  try {
    const responsePromise = page.waitForResponse(
      (r) => r.url().includes("/api/comment/list/") && !r.url().includes("/reply/") && r.status() === 200,
      { timeout: 12e3 }
    ).catch(() => null);
    await page.goto(
      `https://www.tiktok.com/@${username}/video/${videoId}`,
      { waitUntil: "domcontentloaded", timeout: 3e4 }
    );
    const icon = page.locator('[data-e2e="comment-icon"]');
    await page.waitForSelector('[data-e2e="comment-icon"]', { timeout: 5e3 }).catch(() => null);
    if (await icon.count() > 0) {
      await icon.first().click({ force: true }).catch(() => {
      });
    } else {
      dbg(`comment icon not found for ${videoId}, scrolling instead`);
      for (let i = 0; i < 3; i++) {
        await page.mouse.wheel(0, 400);
        await delay(300);
      }
    }
    const resp = await responsePromise;
    if (!resp) dbg(`comment API timed out for ${videoId}`);
    if (resp) {
      try {
        const j = await resp.json();
        for (const c of j.comments ?? []) {
          if (!seen.has(c.cid)) {
            seen.add(c.cid);
            const parsed = parseComment(c, videoId);
            if (parsed) {
              const inlineReplies = c.reply_list ?? [];
              if (inlineReplies.length && !parsed.author_reply) {
                const r = inlineReplies.find((r2) => r2.user?.unique_id === username);
                if (r) parsed.author_reply = parseReply(r);
              }
              comments.push(parsed);
            }
          }
        }
      } catch {
      }
    }
    const withReplies = comments.filter((c) => c.metrics.replies > 0 && !c.author_reply);
    if (withReplies.length > 0) {
      await fetchAuthorReplies(page, username, comments, withReplies, dbg);
    }
  } catch (e) {
    dbg(`comment page error for ${videoId}: ${e.message}`);
  }
  dbg(`video ${videoId}: ${comments.length} comments`);
  return comments.slice(0, maxComments);
}
async function fetchAuthorReplies(page, authorUsername, comments, withReplies, dbg) {
  const commentMap = new Map(comments.map((c) => [c.id, c]));
  const replyMap = /* @__PURE__ */ new Map();
  const onReply = async (res) => {
    const url = res.url();
    if (!url.includes("/comment/list") || res.status() !== 200) return;
    dbg(`[reply handler] ${url.replace("https://www.tiktok.com", "").split("?")[0]} status=${res.status()}`);
    if (!url.includes("/reply/")) return;
    try {
      const u = new URL(url);
      const cid = u.searchParams.get("comment_id");
      const j = await res.json();
      dbg(`[reply data] cid=${cid} count=${j.comments?.length ?? 0}`);
      const reply = (j.comments ?? []).find((r) => r.user?.unique_id === authorUsername);
      if (reply && cid && !replyMap.has(cid)) replyMap.set(cid, parseReply(reply));
    } catch {
    }
  };
  page.on("response", onReply);
  try {
    await page.waitForSelector('[data-e2e="comment-level-1"]', { timeout: 5e3 }).catch(() => null);
    await page.evaluate(() => {
      const el = document.querySelector('[data-e2e="comment-level-1"]');
      if (!el) return;
      let p = el.parentElement;
      while (p && p !== document.body) {
        const s = window.getComputedStyle(p);
        if ((s.overflowY === "auto" || s.overflowY === "scroll") && p.scrollHeight > p.clientHeight) {
          p.scrollTop = 0;
          return;
        }
        p = p.parentElement;
      }
    });
    await delay(400);
    const expandSel = '[class*="DivViewRepliesContainer"]';
    let stale = 0;
    let iter = 0;
    let totalClicks = 0;
    const MAX_SCROLL = 80;
    while (stale < 3 && iter++ < MAX_SCROLL) {
      const btns = page.locator(expandSel).filter({ hasText: /\d/ });
      const count = await btns.count();
      let newClicks = 0;
      for (let i = 0; i < count; i++) {
        const btn = btns.nth(i);
        const box = await btn.boundingBox().catch(() => null);
        if (!box) continue;
        newClicks++;
        totalClicks++;
        await btn.click({ force: true, timeout: 1500 }).catch(() => {
        });
        await delay(100);
      }
      const atBottom = await page.evaluate(() => {
        const el = document.querySelector('[data-e2e="comment-level-1"]');
        if (!el) return true;
        let p = el.parentElement;
        while (p && p !== document.body) {
          const s = window.getComputedStyle(p);
          if ((s.overflowY === "auto" || s.overflowY === "scroll") && p.scrollHeight > p.clientHeight) {
            const wasAtBottom = p.scrollTop + p.clientHeight >= p.scrollHeight - 20;
            p.scrollTop += 350;
            return wasAtBottom;
          }
          p = p.parentElement;
        }
        return true;
      });
      await delay(400);
      if (atBottom && newClicks === 0) stale++;
      else if (newClicks > 0) stale = 0;
    }
    dbg(`reply-expander clicks: ${totalClicks}`);
    await delay(2e3);
  } finally {
    page.off("response", onReply);
  }
  for (const [cid, reply] of replyMap) {
    const c = commentMap.get(cid);
    if (c) c.author_reply = reply;
  }
  for (const c of withReplies) {
    const status = c.author_reply ? "\u2713" : "\u2717 not found";
    dbg(`  reply cid=${c.id} replies=${c.metrics.replies} author_reply=${status}`);
  }
  dbg(`author replies found: ${replyMap.size}/${withReplies.length}`);
}
async function fetchCommentsParallel(context, videos, maxComments, debug) {
  const n = Math.min(COMMENT_CONCURRENCY, videos.length);
  const pages = await Promise.all(Array.from({ length: n }, () => setupCommentPage(context)));
  const results = new Array(videos.length).fill(null);
  let next = 0;
  let done = 0;
  const worker = async (page) => {
    while (next < videos.length) {
      const i = next++;
      const v = videos[i];
      results[i] = await fetchCommentsOnPage(page, v.id, v.author.username, maxComments, debug);
      done++;
      console.log(`Comments: ${done}/${videos.length}`);
    }
    await page.close().catch(() => {
    });
  };
  await Promise.all(pages.map(worker));
  return results;
}
async function scrapeTikTokUser(target, context, opts = {}) {
  const {
    max = 1e3,
    maxComments = 0,
    // 0 = skip comments; >0 = fetch up to N per video
    debug = false,
    ...filterOpts
  } = opts;
  const dbg = (...m) => debug && console.log("[DBG]", ...m);
  const filterFn = buildFilter2(filterOpts);
  const { username } = target;
  const page = await setupPage2(context);
  let profile = null;
  const videoMap = /* @__PURE__ */ new Map();
  const state = { hasMore: true };
  const onResponse = async (res) => {
    if (res.status() !== 200) return;
    const ct = res.headers()["content-type"] ?? "";
    if (!ct.includes("json")) return;
    if (!res.url().includes("/api/post/item_list")) return;
    try {
      const j = await res.json();
      state.hasMore = j.hasMore ?? true;
      for (const item of j.itemList ?? []) {
        if (!videoMap.has(item.id)) {
          const v = parseVideo(item);
          if (v) videoMap.set(item.id, v);
        }
      }
      dbg(`item_list: +${j.itemList?.length ?? 0} (total: ${videoMap.size}, hasMore: ${state.hasMore})`);
    } catch {
    }
  };
  page.on("response", onResponse);
  try {
    await page.goto(`https://www.tiktok.com/@${username}`, {
      waitUntil: "domcontentloaded",
      timeout: 6e4
    });
    await delay(NAV_DELAY);
    const ssr = await page.evaluate(() => {
      try {
        const el = document.getElementById("__UNIVERSAL_DATA_FOR_REHYDRATION__");
        return el ? JSON.parse(el.textContent) : null;
      } catch {
        return null;
      }
    });
    profile = extractUserFromSSR(ssr);
    if (profile) dbg(`profile: ${profile.nickname} \u2014 ${profile.followers} followers`);
    await scrollForVideos(page, videoMap, { max, debug, state });
  } finally {
    page.off("response", onResponse);
    await page.close().catch(() => {
    });
  }
  let videos = [...videoMap.values()].filter(filterFn).sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, max);
  if (maxComments > 0 && videos.length > 0) {
    console.log(`  Fetching comments for ${videos.length} videos (${COMMENT_CONCURRENCY} parallel)...`);
    const commentResults = await fetchCommentsParallel(context, videos, maxComments, debug);
    for (let i = 0; i < videos.length; i++) {
      videos[i].comments = commentResults[i] ?? [];
    }
  } else {
    for (const v of videos) v.comments = [];
  }
  return { profile, videos };
}
async function scrapeTikTok(targets, opts = {}) {
  const parsed = (Array.isArray(targets) ? targets : [targets]).map((t) => typeof t === "string" ? parseTikTokUser(t) : t).filter(Boolean);
  if (!parsed.length) throw new Error("No valid TikTok username provided.");
  const {
    headed = false,
    debug = false,
    resetSession = false,
    sessionDir = DEFAULT_SESSION_DIR,
    ...userOpts
  } = opts;
  if (resetSession && existsSync4(sessionDir))
    rmSync3(sessionDir, { recursive: true, force: true });
  if (!sessionExists2(sessionDir) && !headed)
    throw new Error("No saved session. Run with --headed to log in first.");
  const context = await createBrowser2(sessionDir, !headed);
  try {
    const loginPage = await context.newPage();
    await loginPage.goto("https://www.tiktok.com", {
      waitUntil: "domcontentloaded",
      timeout: 6e4
    });
    await delay(2e3);
    if (!await isLoggedInTikTok(loginPage)) {
      if (!headed) {
        await context.close();
        throw new Error("Session expired. Run with --headed to re-login.");
      }
      const ok = await waitForLogin2(loginPage);
      if (!ok) throw new Error("Login timed out.");
      console.log("\nLogin confirmed. Starting scrape...");
    } else {
      console.log("Session active.");
    }
    await loginPage.close();
    const results = {};
    for (const target of parsed) {
      console.log(`
${"\u2550".repeat(52)}`);
      console.log(`  @${target.username}  [TikTok]`);
      console.log(`${"\u2550".repeat(52)}`);
      results[target.username] = await scrapeTikTokUser(target, context, { debug, ...userOpts });
    }
    return results;
  } finally {
    await context.close();
  }
}

// src/platforms/tiktok/output.js
function toTikTokJSON(profile, videos) {
  return JSON.stringify({ profile, videos }, null, 2);
}

// src/platforms/reddit/scraper.js
var BASE = "https://www.reddit.com";
var USER_AGENT = "nodejs:twitter-scraper:1.0 (open-source scraper)";
var DELAY_MS = 750;
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
async function redditFetch(path, params = {}, retries = 3) {
  const url = new URL(BASE + path);
  url.searchParams.set("raw_json", "1");
  for (const [k, v] of Object.entries(params)) {
    if (v != null) url.searchParams.set(k, String(v));
  }
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(url.toString(), {
      headers: { "User-Agent": USER_AGENT }
    });
    if (res.status === 429) {
      const wait = parseInt(res.headers.get("retry-after") ?? "60", 10) * 1e3;
      console.warn(`[WARN] Rate limit 429 \u2014 waiting ${Math.ceil(wait / 1e3)}s...`);
      await sleep(wait);
      continue;
    }
    if (res.status === 404) return null;
    if (!res.ok) {
      if (attempt < retries) {
        await sleep(2e3 * (attempt + 1));
        continue;
      }
      throw new Error(`Reddit API ${res.status} ${res.statusText}: ${path}`);
    }
    return res.json();
  }
  throw new Error(`Reddit API: max retries exceeded for ${path}`);
}
function parsePost(child) {
  if (child.kind !== "t3") return null;
  const d = child.data;
  return {
    id: d.id,
    url: `https://reddit.com${d.permalink}`,
    title: d.title ?? "",
    text: d.selftext ?? "",
    link_url: d.is_self ? null : d.url,
    created_at: new Date(d.created_utc * 1e3).toISOString(),
    author: { username: d.author },
    subreddit: d.subreddit,
    metrics: {
      score: d.score ?? 0,
      ratio: d.upvote_ratio ?? null,
      comments: d.num_comments ?? 0,
      awards: d.total_awards_received ?? 0
    },
    flair: d.link_flair_text ?? null,
    is_nsfw: d.over_18 ?? false,
    type: "post",
    platform: "reddit"
  };
}
function parseComment2(child) {
  if (child.kind !== "t1") return null;
  const d = child.data;
  return {
    id: d.id,
    url: `https://reddit.com${d.permalink}`,
    title: "",
    text: d.body ?? "",
    link_url: d.link_url ?? null,
    link_title: d.link_title ?? "",
    created_at: new Date(d.created_utc * 1e3).toISOString(),
    author: { username: d.author },
    subreddit: d.subreddit,
    metrics: {
      score: d.score ?? 0,
      ratio: null,
      comments: 0,
      awards: d.total_awards_received ?? 0
    },
    flair: null,
    is_nsfw: false,
    type: "comment",
    platform: "reddit"
  };
}
async function fetchListing(path, opts = {}) {
  const {
    max = 200,
    params = {},
    parse = parsePost,
    filter = () => true,
    earlyStop = () => false,
    debug = false,
    label = path
  } = opts;
  const items = [];
  let after = null;
  let page = 0;
  while (items.length < max) {
    page++;
    const qp = { limit: Math.min(100, max - items.length + 20), ...params };
    if (after) qp.after = after;
    if (debug) process.stdout.write(`
[DBG] ${path} page=${page} after=${after ?? "start"}`);
    const json = await redditFetch(path, qp);
    if (!json) break;
    const children = json?.data?.children ?? [];
    if (!children.length) break;
    const batch = [];
    for (const child of children) {
      if (child.kind === "more") continue;
      const item = parse(child);
      if (!item) continue;
      batch.push(item);
      if (filter(item)) items.push(item);
    }
    console.log(`[${label}] ${items.length} items (page ${page})`);
    if (earlyStop(batch)) {
      console.log(`
  [${label}] Date cutoff reached \u2014 stopping early.`);
      break;
    }
    after = json?.data?.after;
    if (!after) break;
    if (items.length >= max) break;
    await sleep(DELAY_MS);
  }
  return items.slice(0, max);
}
async function fetchSubreddit(subreddit, opts = {}) {
  const {
    sort = "hot",
    timeframe = "all",
    max = 200,
    since = null,
    until = null,
    keyword = null,
    debug = false
  } = opts;
  console.log(`
${"\u2550".repeat(52)}`);
  console.log(`  r/${subreddit}  [sort: ${sort}${["top", "controversial"].includes(sort) ? ` / ${timeframe}` : ""}]`);
  console.log(`${"\u2550".repeat(52)}`);
  const sinceDate = since ? new Date(since) : null;
  const untilDate = until ? new Date(until) : null;
  const kw = keyword ? keyword.toLowerCase() : null;
  const params = ["top", "controversial"].includes(sort) ? { t: timeframe } : {};
  return fetchListing(`/r/${subreddit}/${sort}.json`, {
    max,
    debug,
    params,
    parse: parsePost,
    label: `r/${subreddit}`,
    filter(item) {
      const d = new Date(item.created_at);
      if (sinceDate && d < sinceDate) return false;
      if (untilDate && d > untilDate) return false;
      if (kw && !(item.title + " " + item.text).toLowerCase().includes(kw)) return false;
      return true;
    },
    earlyStop(batch) {
      if (!sinceDate) return false;
      return batch.length > 0 && batch.every((t) => new Date(t.created_at) < sinceDate);
    }
  });
}
async function fetchUser(username, opts = {}) {
  const {
    noPosts = false,
    noComments = false,
    sort = "new",
    timeframe = "all",
    max = 200,
    since = null,
    until = null,
    keyword = null,
    debug = false
  } = opts;
  console.log(`
${"\u2550".repeat(52)}`);
  console.log(`  u/${username}`);
  console.log(`${"\u2550".repeat(52)}`);
  const sinceDate = since ? new Date(since) : null;
  const untilDate = until ? new Date(until) : null;
  const kw = keyword ? keyword.toLowerCase() : null;
  const params = { sort, t: timeframe };
  function makeFilter() {
    return function filter(item) {
      const d = new Date(item.created_at);
      if (sinceDate && d < sinceDate) return false;
      if (untilDate && d > untilDate) return false;
      if (kw && !(item.title + " " + item.text).toLowerCase().includes(kw)) return false;
      return true;
    };
  }
  function earlyStop(batch) {
    if (!sinceDate) return false;
    return batch.length > 0 && batch.every((t) => new Date(t.created_at) < sinceDate);
  }
  const allItems = [];
  if (!noPosts) {
    console.log("  \u2192 Posts...");
    const posts = await fetchListing(`/user/${username}/submitted.json`, {
      max,
      debug,
      params,
      parse: parsePost,
      label: "posts",
      filter: makeFilter(),
      earlyStop
    });
    allItems.push(...posts);
  }
  if (!noComments) {
    if (!noPosts) await sleep(DELAY_MS);
    console.log("  \u2192 Comments...");
    const comments = await fetchListing(`/user/${username}/comments.json`, {
      max,
      debug,
      params,
      parse: parseComment2,
      label: "comments",
      filter: makeFilter(),
      earlyStop
    });
    allItems.push(...comments);
  }
  return allItems.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}
async function scrapeReddit(targets, opts = {}) {
  const list = Array.isArray(targets) ? targets : [targets];
  const results = {};
  for (const target of list) {
    const rMatch = target.match(/^r\/(.+)/i);
    const uMatch = target.match(/^(?:u|user)\/(.+)/i);
    if (rMatch) {
      results[target] = await fetchSubreddit(rMatch[1], opts);
    } else if (uMatch) {
      results[target] = await fetchUser(uMatch[1], opts);
    } else {
      console.warn(`[WARN] Unrecognised target "${target}" \u2014 expected r/subreddit or u/username`);
    }
    if (list.indexOf(target) < list.length - 1) await sleep(DELAY_MS);
  }
  return results;
}

// src/platforms/reddit/arctic.js
var BASE2 = "https://arctic-shift.photon-reddit.com/api";
var UA = "nodejs:twitter-scraper:1.0";
var DELAY_MS2 = 400;
function sleep2(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
async function arcticFetch(path, params = {}, retries = 3) {
  const url = new URL(BASE2 + path);
  for (const [k, v] of Object.entries(params)) {
    if (v != null) url.searchParams.set(k, String(v));
  }
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(url.toString(), { headers: { "User-Agent": UA } });
    const remaining = parseInt(res.headers.get("x-ratelimit-remaining") ?? "999", 10);
    if (remaining < 20) {
      const reset = parseInt(res.headers.get("x-ratelimit-reset") ?? "10", 10);
      console.warn(`[WARN] Rate limit \u2014 ${remaining} requests left, waiting ${reset}s...`);
      await sleep2(reset * 1e3);
    }
    if (res.status === 429) {
      const wait = parseInt(res.headers.get("retry-after") ?? "60", 10) * 1e3;
      console.warn(`[WARN] Rate limit 429 \u2014 waiting ${Math.ceil(wait / 1e3)}s...`);
      await sleep2(wait);
      continue;
    }
    if (!res.ok) {
      if (attempt < retries) {
        await sleep2(1500 * (attempt + 1));
        continue;
      }
      throw new Error(`Arctic Shift ${res.status} ${res.statusText}: ${path}`);
    }
    const json = await res.json();
    if (json.error) throw new Error(`Arctic Shift API: ${json.error}`);
    return json.data ?? [];
  }
  throw new Error(`Arctic Shift: max retries exceeded for ${path}`);
}
function parsePost2(raw) {
  return {
    id: raw.id,
    url: `https://reddit.com${raw.permalink}`,
    title: raw.title ?? "",
    text: raw.selftext ?? "",
    link_url: raw.is_self ? null : raw.url_overridden_by_dest ?? raw.url ?? null,
    created_at: new Date(raw.created_utc * 1e3).toISOString(),
    author: { username: raw.author },
    subreddit: raw.subreddit,
    metrics: {
      score: raw.score ?? 0,
      ratio: raw.upvote_ratio ?? null,
      comments: raw.num_comments ?? 0,
      awards: raw.total_awards_received ?? 0
    },
    flair: raw.link_flair_text ?? null,
    is_nsfw: raw.over_18 ?? false,
    type: "post",
    platform: "reddit"
  };
}
function parseComment3(raw) {
  return {
    id: raw.id,
    url: `https://reddit.com${raw.permalink}`,
    title: "",
    text: raw.body ?? "",
    link_url: null,
    link_title: "",
    created_at: new Date(raw.created_utc * 1e3).toISOString(),
    author: { username: raw.author },
    subreddit: raw.subreddit,
    metrics: {
      score: raw.score ?? 0,
      ratio: null,
      comments: 0,
      awards: raw.total_awards_received ?? 0
    },
    flair: null,
    is_nsfw: false,
    type: "comment",
    platform: "reddit"
  };
}
async function fetchListing2(path, opts = {}) {
  const {
    max = 200,
    apiParams = {},
    parse,
    filter = () => true,
    debug = false,
    label = path
  } = opts;
  const seen = /* @__PURE__ */ new Set();
  const items = [];
  let cursor = apiParams.before ?? null;
  let page = 0;
  const fixedAfter = apiParams.after ?? null;
  while (items.length < max) {
    page++;
    const qp = {
      limit: Math.min(100, max - items.length + 20),
      sort: "desc"
    };
    if (fixedAfter) qp.after = fixedAfter;
    if (cursor) qp.before = cursor;
    for (const [k, v] of Object.entries(apiParams)) {
      if (k !== "after" && k !== "before" && v != null) qp[k] = v;
    }
    if (debug) process.stdout.write(`
[DBG] arctic ${path} page=${page} cursor=${cursor ?? "now"}`);
    const batch = await arcticFetch(path, qp);
    if (!batch.length) break;
    for (const raw of batch) {
      if (seen.has(raw.id)) continue;
      seen.add(raw.id);
      const item = parse(raw);
      if (item && filter(item)) items.push(item);
    }
    console.log(`[${label}] ${items.length} items (page ${page})`);
    const lastTs = batch[batch.length - 1].created_utc ?? batch[batch.length - 1].created;
    if (!lastTs) break;
    cursor = lastTs - 1;
    if (fixedAfter && cursor <= fixedAfter) break;
    await sleep2(DELAY_MS2);
  }
  return items.slice(0, max);
}
async function fetchSubredditArctic(subreddit, opts = {}) {
  const { max = 200, since = null, until = null, keyword = null, debug = false } = opts;
  console.log(`
${"\u2550".repeat(52)}`);
  console.log(`  r/${subreddit}  [Arctic Shift \u2014 full history]`);
  if (since || until) console.log(`  ${since ?? "\u221E"} \u2192 ${until ?? "now"}`);
  console.log(`${"\u2550".repeat(52)}`);
  const kw = keyword ? keyword.toLowerCase() : null;
  const apiParams = { subreddit };
  if (since) apiParams.after = Math.floor(new Date(since).getTime() / 1e3);
  if (until) apiParams.before = Math.floor(new Date(until).getTime() / 1e3);
  return fetchListing2("/posts/search", {
    max,
    debug,
    label: `r/${subreddit}`,
    apiParams,
    parse: parsePost2,
    filter: kw ? (item) => (item.title + " " + item.text).toLowerCase().includes(kw) : () => true
  });
}
async function fetchUserArctic(username, opts = {}) {
  const {
    noPosts = false,
    noComments = false,
    max = 200,
    since = null,
    until = null,
    keyword = null,
    debug = false
  } = opts;
  console.log(`
${"\u2550".repeat(52)}`);
  console.log(`  u/${username}  [Arctic Shift \u2014 full history]`);
  if (since || until) console.log(`  ${since ?? "\u221E"} \u2192 ${until ?? "now"}`);
  console.log(`${"\u2550".repeat(52)}`);
  const kw = keyword ? keyword.toLowerCase() : null;
  const baseParams = { author: username };
  if (since) baseParams.after = Math.floor(new Date(since).getTime() / 1e3);
  if (until) baseParams.before = Math.floor(new Date(until).getTime() / 1e3);
  const kwFilter = kw ? (item) => (item.title + " " + item.text).toLowerCase().includes(kw) : () => true;
  const allItems = [];
  if (!noPosts) {
    console.log("  \u2192 Posts...");
    const posts = await fetchListing2("/posts/search", {
      max,
      debug,
      label: "posts",
      apiParams: { ...baseParams },
      parse: parsePost2,
      filter: kwFilter
    });
    allItems.push(...posts);
  }
  if (!noComments) {
    if (!noPosts) await sleep2(DELAY_MS2);
    console.log("  \u2192 Comments...");
    const comments = await fetchListing2("/comments/search", {
      max,
      debug,
      label: "comments",
      apiParams: { ...baseParams },
      parse: parseComment3,
      filter: kwFilter
    });
    allItems.push(...comments);
  }
  return allItems.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}
async function scrapeArctic(targets, opts = {}) {
  const list = Array.isArray(targets) ? targets : [targets];
  const results = {};
  for (const target of list) {
    const rMatch = target.match(/^r\/(.+)/i);
    const uMatch = target.match(/^(?:u|user)\/(.+)/i);
    if (rMatch) {
      results[target] = await fetchSubredditArctic(rMatch[1], opts);
    } else if (uMatch) {
      results[target] = await fetchUserArctic(uMatch[1], opts);
    } else {
      console.warn(`[WARN] Unknown target "${target}" \u2014 expected r/subreddit or u/username`);
    }
    if (list.indexOf(target) < list.length - 1) await sleep2(DELAY_MS2);
  }
  return results;
}

// src/platforms/reddit/output.js
function toRedditJSON(items) {
  return JSON.stringify(items, null, 2);
}

// src/platforms/threads/scraper.js
import { resolve as resolve4 } from "path";
import { writeFileSync as writeFileSync3 } from "fs";
import { createInterface as createInterface3 } from "readline";
var DESKTOP_VIEWPORT = { width: 1280, height: 900 };
async function setupDesktopPage(context) {
  const page = await context.newPage();
  await page.route("**/*", (route) => {
    const type = route.request().resourceType();
    if (type === "image" || type === "media") return route.abort();
    return route.continue();
  });
  await page.setViewportSize(DESKTOP_VIEWPORT);
  return page;
}
var DEFAULT_SESSION_DIR2 = resolve4(".session-threads");
function parseThreadsUsername(raw) {
  const urlMatch = raw.match(/threads\.(?:net|com)\/@?([A-Za-z0-9_.]+)/);
  if (urlMatch) return urlMatch[1];
  return raw.replace(/^@/, "").trim() || null;
}
async function isLoggedInThreads(page) {
  try {
    const cookies = await page.context().cookies();
    return cookies.some((c) => c.name === "sessionid");
  } catch {
    return false;
  }
}
async function waitForThreadsLogin(page) {
  console.log("\nNot logged in. Please log in to Threads in the browser window.");
  console.log("\u2500".repeat(50));
  console.log("  After login completes \u2192press Enter here to confirm");
  console.log("\u2500".repeat(50));
  return new Promise((resolve14) => {
    let done = false;
    const finish = (result) => {
      if (done) return;
      done = true;
      clearInterval(poll);
      clearTimeout(timer);
      resolve14(result);
    };
    const poll = setInterval(async () => {
      if (done) return;
      if (await isLoggedInThreads(page)) finish(true);
    }, 1500);
    const rl = createInterface3({ input: process.stdin, output: process.stdout });
    rl.question("", async () => {
      rl.close();
      if (done) return;
      const ok = await isLoggedInThreads(page);
      if (!ok) {
        console.log("\n  Not logged in yet \u2014still waiting (press Enter again after login)...");
        const rl2 = createInterface3({ input: process.stdin, output: process.stdout });
        rl2.question("", async () => {
          rl2.close();
          finish(await isLoggedInThreads(page));
        });
        return;
      }
      finish(true);
    });
    const timer = setTimeout(() => finish(false), 18e4);
  });
}
function extractMedia2(post) {
  const media = [];
  const img = post.image_versions2?.candidates?.[0];
  if (img) media.push({ type: "image", url: img.url });
  if (post.video_versions?.length) {
    media.push({ type: "video", url: post.video_versions[0].url });
  }
  for (const item of post.carousel_media ?? []) {
    const ci = item.image_versions2?.candidates?.[0];
    if (ci) media.push({ type: "image", url: ci.url });
  }
  return media;
}
function parsePost3(post) {
  if (!post) return null;
  const pk = post.pk ?? post.id;
  if (!pk) return null;
  const user = post.user ?? {};
  const username = user.username ?? "";
  const takenAt = post.taken_at ?? post.device_timestamp;
  if (!takenAt) return null;
  const textInfo = post.text_post_app_info ?? {};
  const isReply = !!(textInfo.is_reply ?? post.is_reply ?? false);
  const isRepost = !!(textInfo.is_repost ?? post.is_repost ?? false);
  const code = post.code ?? null;
  return {
    id: String(pk),
    url: code ? `https://www.threads.com/@${username}/post/${code}` : `https://www.threads.com/@${username}`,
    text: post.caption?.text ?? post.text ?? "",
    created_at: new Date(takenAt * 1e3).toISOString(),
    author: {
      username,
      name: user.full_name ?? "",
      followers: user.follower_count ?? 0,
      verified: user.is_verified ?? false
    },
    metrics: {
      likes: post.like_count ?? 0,
      replies: post.reply_count ?? 0,
      reposts: post.repost_count ?? 0,
      views: post.view_count ?? 0
    },
    media: extractMedia2(post),
    is_reply: isReply,
    is_repost: isRepost,
    type: "thread",
    platform: "threads"
  };
}
function findPostsInObj(obj, results, depth = 0) {
  if (depth > 25 || !obj || typeof obj !== "object") return;
  if (Array.isArray(obj)) {
    for (const item of obj) findPostsInObj(item, results, depth + 1);
    return;
  }
  if ((obj.pk || obj.id) && (obj.taken_at || obj.device_timestamp)) {
    const post = parsePost3(obj);
    if (post) results.push(post);
    return;
  }
  for (const val of Object.values(obj)) findPostsInObj(val, results, depth + 1);
}
async function extractSSRPosts(page) {
  const scriptTexts = await page.evaluate(
    () => Array.from(document.querySelectorAll('script[type="application/json"]')).map((s) => s.textContent)
  );
  const results = [];
  for (const text of scriptTexts) {
    try {
      findPostsInObj(JSON.parse(text), results);
    } catch {
    }
  }
  return results;
}
function attachThreadsInterceptor(page, threadMap, state, opts = {}) {
  const { debug = false } = opts;
  const dbg = (...m) => debug && console.log("[DBG]", ...m);
  page.on("response", async (response) => {
    const url = response.url();
    const status = response.status();
    if (status === 429) {
      state.rateLimitUntil = Date.now() + 6e4;
      console.warn("[WARN] Rate limit 429 \u2014 pausing 60s...");
      return;
    }
    if (debug && (url.includes("threads.com") || url.includes("threads.net") || url.includes("instagram.com"))) {
      const ct2 = response.headers()["content-type"] ?? "";
      dbg(`[NET] ${status} ${ct2.split(";")[0].padEnd(25)} ${url.slice(0, 120)}`);
    }
    const isCandidate = url.includes("threads.com") || url.includes("threads.net") || url.includes("instagram.com");
    if (!isCandidate || status !== 200) return;
    const ct = response.headers()["content-type"] ?? "";
    if (!ct.includes("json")) return;
    try {
      const text = await response.text();
      const json = JSON.parse(text);
      if (debug && !state.dumpedOnce) {
        state.dumpedOnce = true;
        writeFileSync3(resolve4("debug_threads_response.json"), JSON.stringify(json, null, 2), "utf-8");
        dbg(`Raw response dumped \u2192debug_threads_response.json  (url: ${url.slice(0, 80)})`);
      }
      const found = [];
      findPostsInObj(json, found);
      dbg(`XHR parsed \u2192${found.length} threads  (url: ${url.slice(0, 80)})`);
      for (const t of found) {
        if (!threadMap.has(t.id)) threadMap.set(t.id, t);
      }
    } catch (e) {
      dbg("XHR parse error:", e.message);
    }
  });
}
async function scrollPage(page, threadMap, state, opts = {}) {
  const { max = 200, debug = false } = opts;
  const dbg = (...m) => debug && console.log("[DBG]", ...m);
  let staleRounds = 0;
  let prevCount = threadMap.size;
  let round = 0;
  await page.mouse.move(640, 450);
  while (threadMap.size < max && staleRounds < 6) {
    round++;
    const pause = (state.rateLimitUntil ?? 0) - Date.now();
    if (pause > 0) {
      console.warn(`[WARN] Rate limit \u2014 waiting ${Math.ceil(pause / 1e3)}s...`);
      await page.waitForTimeout(pause);
    }
    console.log(`Threads: ${threadMap.size} collected (scroll #${round})`);
    for (let i = 0; i < 15; i++) {
      await page.mouse.wheel(0, 600);
      await page.waitForTimeout(100);
    }
    await page.waitForTimeout(4500);
    if (threadMap.size === prevCount) {
      staleRounds++;
      dbg(`Stale round ${staleRounds}`);
      if (staleRounds === 3) {
        for (let i = 0; i < 6; i++) {
          await page.mouse.wheel(0, -500);
          await page.waitForTimeout(100);
        }
        await page.waitForTimeout(800);
        for (let i = 0; i < 15; i++) {
          await page.mouse.wheel(0, 600);
          await page.waitForTimeout(100);
        }
        await page.waitForTimeout(4500);
      }
    } else {
      staleRounds = 0;
      prevCount = threadMap.size;
    }
  }
}
function buildFilter3(opts = {}) {
  const since = opts.since ? new Date(opts.since) : null;
  const until = opts.until ? new Date(opts.until) : null;
  const keyword = opts.keyword ? opts.keyword.toLowerCase() : null;
  return function filter(t) {
    if (since || until) {
      const d = new Date(t.created_at);
      if (since && d < since) return false;
      if (until && d > until) return false;
    }
    if (opts.noReplies && t.is_reply) return false;
    if (opts.noReposts && t.is_repost) return false;
    if (keyword && !t.text.toLowerCase().includes(keyword)) return false;
    return true;
  };
}
async function scrapeThreadsUser(username, context, opts = {}) {
  const { max = 1e3, debug = false, ...filterOpts } = opts;
  console.log(`
${"\u2550".repeat(52)}`);
  console.log(`  @${username}  [Threads]`);
  console.log(`${"\u2550".repeat(52)}`);
  const threadMap = /* @__PURE__ */ new Map();
  const state = { rateLimitUntil: 0, dumpedOnce: false };
  const filterFn = buildFilter3(filterOpts);
  const page = await setupDesktopPage(context);
  attachThreadsInterceptor(page, threadMap, state, { debug });
  try {
    await page.goto(`https://www.threads.com/@${username}`, {
      waitUntil: "domcontentloaded",
      timeout: 6e4
    });
    await page.waitForTimeout(3e3);
    const bodyText = await page.evaluate(() => document.body.innerText);
    if (bodyText.toLowerCase().includes("this page isn't available") || bodyText.toLowerCase().includes("page not found")) {
      console.error(`[ERROR] @${username} not found or private.`);
      return [];
    }
    const ssrPosts = await extractSSRPosts(page);
    for (const t of ssrPosts) {
      if (!threadMap.has(t.id)) threadMap.set(t.id, t);
    }
    await scrollPage(page, threadMap, state, { max, debug });
    if (!filterOpts.noReplies && threadMap.size < max) {
      await page.goto(`https://www.threads.com/@${username}/replies`, {
        waitUntil: "domcontentloaded",
        timeout: 6e4
      });
      await page.waitForTimeout(3e3);
      const repliesSSR = await extractSSRPosts(page);
      for (const t of repliesSSR) {
        if (!threadMap.has(t.id)) threadMap.set(t.id, t);
      }
      await scrollPage(page, threadMap, state, { max, debug });
    }
  } finally {
    await page.close();
  }
  return Array.from(threadMap.values()).filter(filterFn).sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, max);
}
async function scrapeThreads(usernames, opts = {}) {
  const names = (Array.isArray(usernames) ? usernames : [usernames]).map(parseThreadsUsername).filter(Boolean);
  if (!names.length) throw new Error("No valid Threads username provided.");
  const {
    headed = false,
    debug = false,
    resetSession = false,
    sessionDir = DEFAULT_SESSION_DIR2,
    ...userOpts
  } = opts;
  if (resetSession) clearSession(sessionDir);
  if (!sessionExists(sessionDir) && !headed) {
    throw new Error("No saved session. Call scrapeThreads() with headed: true to log in first.");
  }
  const context = await createBrowser(sessionDir, {
    headless: !headed,
    viewport: DESKTOP_VIEWPORT
  });
  try {
    const checkPage = await setupDesktopPage(context);
    await checkPage.goto("https://www.threads.com", {
      waitUntil: "domcontentloaded",
      timeout: 6e4
    });
    await checkPage.waitForTimeout(3e3);
    const loggedIn = await isLoggedInThreads(checkPage);
    if (!loggedIn) {
      if (headed) {
        const ok = await waitForThreadsLogin(checkPage);
        if (!ok) throw new Error("Login timed out.");
        console.log("\nLogin confirmed. Starting scrape...");
      } else {
        await context.close();
        throw new Error("Session expired. Call scrapeThreads() with headed: true to re-login.");
      }
    } else {
      console.log("Session active.");
    }
    await checkPage.close();
    const results = {};
    for (const username of names) {
      results[username] = await scrapeThreadsUser(username, context, userOpts);
    }
    return results;
  } finally {
    await context.close();
  }
}

// src/platforms/threads/output.js
function toThreadsJSON(threads) {
  return JSON.stringify(threads, null, 2);
}

// src/platforms/pixiv/scraper.js
import { resolve as resolve5 } from "path";
import { createInterface as createInterface4 } from "readline";
var DEFAULT_SESSION_DIR3 = resolve5(".session-pixiv");
var BATCH_SIZE = 10;
var BATCH_DELAY = 400;
var delay2 = (ms) => new Promise((r) => setTimeout(r, ms));
async function setupPage3(context) {
  const page = await context.newPage();
  await page.route("**/*", (route) => {
    const t = route.request().resourceType();
    if (t === "image" || t === "media") return route.abort();
    return route.continue();
  });
  return page;
}
async function pixivGet(page, url) {
  const result = await page.evaluate(async (u) => {
    try {
      const res = await fetch(u, { credentials: "include" });
      const json = await res.json();
      return { ok: true, data: json };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }, url);
  if (!result.ok) throw new Error(`Fetch failed: ${result.error}`);
  if (result.data.error) throw new Error(`Pixiv API: ${result.data.message ?? url}`);
  return result.data.body;
}
function parsePixivUser(raw) {
  const urlMatch = raw.match(/pixiv\.net\/(?:en\/)?users?\/(\d+)/i);
  if (urlMatch) return urlMatch[1];
  if (/^\d+$/.test(raw.trim())) return raw.trim();
  return null;
}
async function isLoggedInPixiv(page) {
  try {
    const ok = await page.evaluate(async () => {
      try {
        const res = await fetch("/ajax/user/extra?lang=en", { credentials: "include" });
        const json = await res.json();
        return !json.error && !!json.body;
      } catch {
        return false;
      }
    });
    return ok;
  } catch {
    return false;
  }
}
async function waitForPixivLogin(page) {
  console.log("\nNot logged in. Please log in to Pixiv in the browser window.");
  console.log("\u2500".repeat(50));
  console.log("  After login completes \u2192press Enter here to confirm");
  console.log("\u2500".repeat(50));
  return new Promise((resolve14) => {
    let done = false;
    const finish = (result) => {
      if (done) return;
      done = true;
      clearInterval(poll);
      clearTimeout(timer);
      resolve14(result);
    };
    const poll = setInterval(async () => {
      if (done) return;
      if (await isLoggedInPixiv(page)) finish(true);
    }, 1500);
    const rl = createInterface4({ input: process.stdin, output: process.stdout });
    rl.question("", async () => {
      rl.close();
      if (done) return;
      const ok = await isLoggedInPixiv(page);
      if (!ok) {
        console.log("\n  Not logged in yet \u2014still waiting (press Enter again after login)...");
        const rl2 = createInterface4({ input: process.stdin, output: process.stdout });
        rl2.question("", async () => {
          rl2.close();
          finish(await isLoggedInPixiv(page));
        });
        return;
      }
      finish(true);
    });
    const timer = setTimeout(() => finish(false), 18e4);
  });
}
function parseWork(work) {
  if (!work?.id) return null;
  const xRestrict = work.xRestrict ?? 0;
  const rawTags = work.tags?.tags ?? work.tags ?? [];
  const tags = rawTags.map((t) => typeof t === "string" ? t : t.tag).filter(Boolean);
  const caption = (work.description ?? "").replace(/<[^>]+>/g, "");
  return {
    id: String(work.id),
    url: `https://www.pixiv.net/artworks/${work.id}`,
    title: work.title ?? "",
    caption,
    created_at: work.createDate ? new Date(work.createDate).toISOString() : null,
    author: {
      id: String(work.userId ?? ""),
      name: work.userName ?? "",
      account: work.userAccount ?? ""
    },
    metrics: {
      bookmarks: work.bookmarkCount ?? 0,
      views: work.viewCount ?? 0,
      likes: work.likeCount ?? 0,
      comments: work.commentCount ?? 0
    },
    tags,
    // illustType: 0=illust, 1=manga, 2=ugoira
    type: ["illust", "manga", "ugoira"][work.illustType ?? 0] ?? "illust",
    page_count: work.pageCount ?? 1,
    // xRestrict: 0=safe, 1=R18, 2=R18-G
    is_r18: xRestrict >= 1,
    is_r18g: xRestrict >= 2,
    x_restrict: xRestrict,
    platform: "pixiv"
  };
}
function buildFilter4(opts = {}) {
  const since = opts.since ? new Date(opts.since) : null;
  const until = opts.until ? new Date(opts.until) : null;
  const keyword = opts.keyword ? opts.keyword.toLowerCase() : null;
  return function filter(w) {
    if (since || until) {
      const d = new Date(w.created_at);
      if (since && d < since) return false;
      if (until && d > until) return false;
    }
    if (opts.noR18 && w.is_r18) return false;
    if (opts.onlyR18 && !w.is_r18) return false;
    if (keyword) {
      const haystack = `${w.title} ${w.caption} ${w.tags.join(" ")}`.toLowerCase();
      if (!haystack.includes(keyword)) return false;
    }
    return true;
  };
}
async function scrapePixivUser(userId, page, opts = {}) {
  const { max = 1e3, debug = false, ...filterOpts } = opts;
  const dbg = (...m) => debug && console.log("[DBG]", ...m);
  console.log(`
${"\u2550".repeat(52)}`);
  console.log(`  User ${userId}  [Pixiv]`);
  console.log(`${"\u2550".repeat(52)}`);
  await page.goto(`https://www.pixiv.net/en/users/${userId}`, {
    waitUntil: "domcontentloaded",
    timeout: 6e4
  });
  await page.waitForTimeout(2e3);
  let userInfo;
  try {
    userInfo = await pixivGet(page, `https://www.pixiv.net/ajax/user/${userId}?lang=en`);
  } catch (e) {
    console.error(`[ERROR] User ${userId} not found or inaccessible: ${e.message}`);
    return [];
  }
  console.log(`  ${userInfo.name ?? ""} (@${userInfo.account ?? userId})`);
  let allIds;
  try {
    const profile = await pixivGet(page, `https://www.pixiv.net/ajax/user/${userId}/profile/all?lang=en`);
    allIds = [
      ...Object.keys(profile.illusts ?? {}),
      ...Object.keys(profile.manga ?? {})
    ];
  } catch (e) {
    console.error(`[ERROR] Could not fetch artwork list: ${e.message}`);
    return [];
  }
  console.log(`  ${allIds.length} artworks found`);
  if (!allIds.length) return [];
  const artworks = [];
  const limit = Math.min(allIds.length, max);
  for (let i = 0; i < limit; i += BATCH_SIZE) {
    const batch = allIds.slice(i, Math.min(i + BATCH_SIZE, limit));
    console.log(`Fetching artworks: ${Math.min(i + batch.length, limit)}/${limit}`);
    const works = await page.evaluate(async (ids) => {
      const settled = await Promise.allSettled(
        ids.map(
          (id) => fetch(`/ajax/illust/${id}?lang=en`, { credentials: "include" }).then((r) => r.json()).then((j) => !j.error && j.body ? j.body : null).catch(() => null)
        )
      );
      return settled.map((r) => r.status === "fulfilled" ? r.value : null).filter(Boolean);
    }, batch);
    for (const work of works) {
      const parsed = parseWork(work);
      if (parsed) artworks.push(parsed);
    }
    if (i + BATCH_SIZE < limit) await delay2(BATCH_DELAY);
  }
  return artworks.filter(buildFilter4(filterOpts)).sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, max);
}
async function scrapePixiv(targets, opts = {}) {
  const ids = (Array.isArray(targets) ? targets : [targets]).map(parsePixivUser).filter(Boolean);
  if (!ids.length) throw new Error("No valid Pixiv user ID provided.");
  const {
    headed = false,
    debug = false,
    resetSession = false,
    sessionDir = DEFAULT_SESSION_DIR3,
    ...userOpts
  } = opts;
  if (resetSession) clearSession(sessionDir);
  if (!sessionExists(sessionDir) && !headed) {
    throw new Error("No saved session. Call scrapePixiv() with headed: true to log in first.");
  }
  const context = await createBrowser(sessionDir, { headless: !headed });
  try {
    const loginPage = await context.newPage();
    await loginPage.goto("https://www.pixiv.net", {
      waitUntil: "domcontentloaded",
      timeout: 6e4
    });
    await loginPage.waitForTimeout(2e3);
    const loggedIn = await isLoggedInPixiv(loginPage);
    if (!loggedIn) {
      if (headed) {
        const ok = await waitForPixivLogin(loginPage);
        if (!ok) throw new Error("Login timed out.");
        console.log("\nLogin confirmed. Starting scrape...");
      } else {
        await context.close();
        throw new Error("Session expired. Call scrapePixiv() with headed: true to re-login.");
      }
    } else {
      console.log("Session active.");
    }
    await loginPage.close();
    const page = await setupPage3(context);
    const results = {};
    for (const userId of ids) {
      results[userId] = await scrapePixivUser(userId, page, { debug, ...userOpts });
    }
    return results;
  } finally {
    await context.close();
  }
}

// src/platforms/pixiv/output.js
function toPixivJSON(artworks) {
  return JSON.stringify(artworks, null, 2);
}

// src/platforms/naver/scraper.js
import { resolve as resolve6 } from "path";
import { createInterface as createInterface5 } from "readline";
import { existsSync as existsSync5, mkdirSync as mkdirSync5, rmSync as rmSync4 } from "fs";
import { launchPersistentContext as launchPersistentContext3 } from "cloakbrowser";
var DEFAULT_SESSION_DIR4 = resolve6(".session-naver");
var PAGE_SIZE = 50;
var NAV_DELAY2 = 3e3;
var BATCH_SIZE2 = 10;
var BATCH_DELAY2 = 300;
var delay3 = (ms) => new Promise((r) => setTimeout(r, ms));
var DETAIL_BASE = "https://article.cafe.naver.com/gw/v4/cafes";
function sessionExists3(dir) {
  return existsSync5(resolve6(dir, "Default"));
}
async function createBrowser3(sessionDir, headless) {
  mkdirSync5(sessionDir, { recursive: true });
  return launchPersistentContext3({ userDataDir: sessionDir, headless, humanize: true });
}
async function setupPage4(context) {
  const page = await context.newPage();
  await page.route("**/*", (route) => {
    const t = route.request().resourceType();
    if (t === "image" || t === "media") return route.abort();
    return route.continue();
  });
  return page;
}
function parseNaverCafe(raw) {
  if (typeof raw !== "string") return null;
  const urlMatch = raw.match(/cafe\.naver\.com\/([A-Za-z0-9_-]+)/);
  if (!urlMatch) return null;
  const slug = urlMatch[1];
  const cafeUrl = `https://cafe.naver.com/${slug}`;
  const menuMatch = raw.match(/menuid[=%](\d+)/);
  return { cafeUrl, slug, menuId: menuMatch ? menuMatch[1] : null };
}
async function isLoggedIn2(page) {
  try {
    const cookies = await page.context().cookies();
    if (cookies.some((c) => (c.name === "NID_AUT" || c.name === "NID_SES") && c.value))
      return true;
    return await page.evaluate(async () => {
      try {
        const r = await fetch("https://nid.naver.com/user2/api/naverLoginStatus", { credentials: "include" });
        const j = await r.json();
        return j?.isLogin === true || j?.isLogin === "true";
      } catch {
        return false;
      }
    });
  } catch {
    return false;
  }
}
async function waitForLogin3(page) {
  console.log("\nNot logged in. Please log in to Naver in the browser window.");
  console.log("\u2500".repeat(50));
  console.log("  After login completes \u2192 press Enter here to confirm");
  console.log("\u2500".repeat(50));
  return Promise.race([
    (async () => {
      const deadline = Date.now() + 18e4;
      while (Date.now() < deadline) {
        await delay3(2e3);
        if (await isLoggedIn2(page)) return true;
      }
      return false;
    })(),
    new Promise((res) => {
      const rl = createInterface5({ input: process.stdin, output: process.stdout });
      rl.question("", async () => {
        rl.close();
        try {
          await page.goto("https://www.naver.com", { waitUntil: "domcontentloaded", timeout: 15e3 });
          await delay3(1500);
        } catch {
        }
        res(await isLoggedIn2(page));
      });
    })
  ]);
}
function extractClubId(json) {
  return json?.result?.cafeInfoView?.cafeId ?? json?.result?.cafeId ?? json?.message?.result?.cafeInfo?.clubid ?? null;
}
function extractMemberCount(json) {
  return json?.result?.cafeInfoView?.memberCount ?? json?.result?.memberCount ?? json?.message?.result?.cafeInfo?.membercount ?? json?.message?.result?.cafeInfo?.memberCount ?? null;
}
function extractArticleIds(json) {
  const list = json?.result?.articleList ?? json?.result?.articleListInfo?.articleList ?? json?.message?.result?.articleList ?? null;
  if (!Array.isArray(list)) return null;
  return list.filter((item) => item?.articleId).map((item) => ({
    id: item.articleId,
    likeCount: item.likeItCount ?? 0
  }));
}
function extractMenus(json) {
  const raw = json?.result?.menus ?? json?.message?.result?.menus ?? null;
  if (!Array.isArray(raw)) return null;
  const boards = [];
  const walk = (items) => {
    for (const m of items) {
      if (m.menuType === "A" || m.menuType === "L")
        boards.push({ id: String(m.menuId), name: m.menuName ?? "" });
      if (m.menus?.length) walk(m.menus);
    }
  };
  walk(raw);
  return boards;
}
async function extractClubIdFromDOM(page) {
  return page.evaluate(() => {
    if (typeof g_nClubId !== "undefined" && g_nClubId) return String(g_nClubId);
    for (const s of document.scripts) {
      const m = s.text.match(/(?:clubId|g_nClubId)[^0-9]+(\d{6,})/);
      if (m) return m[1];
    }
    for (const a of document.querySelectorAll('a[href*="clubid="]')) {
      const m = a.href.match(/clubid=(\d+)/i);
      if (m) return m[1];
    }
    for (const el of document.querySelectorAll('iframe[src*="clubid"]')) {
      const m = (el.src || "").match(/clubid=(\d+)/i);
      if (m) return m[1];
    }
    return null;
  });
}
async function fetchArticleDetails(cafeId, idEntries, likeMap, dbg) {
  const results = [];
  for (let i = 0; i < idEntries.length; i += BATCH_SIZE2) {
    const batch = idEntries.slice(i, i + BATCH_SIZE2);
    const settled = await Promise.allSettled(
      batch.map(
        ({ id }) => fetch(`${DETAIL_BASE}/${cafeId}/articles/${id}?useCafeId=true&requestFrom=A`).then((r) => r.json()).then((j) => j?.result ?? null).catch(() => null)
      )
    );
    for (const r of settled) {
      if (r.status === "fulfilled" && r.value) results.push(r.value);
    }
    if (i + BATCH_SIZE2 < idEntries.length) await delay3(BATCH_DELAY2);
    console.log(`Fetching details: ${Math.min(i + BATCH_SIZE2, idEntries.length)}/${idEntries.length}`);
  }
  return results;
}
function decodeHtmlEntities(str) {
  return str.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"');
}
function parseArticleDetail(result, cafeSlug, likeMap) {
  if (!result?.articleId || !result?.article) return null;
  const a = result.article;
  const id = result.articleId;
  const text = (a.contentHtml ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 500);
  return {
    id: String(id),
    url: `https://cafe.naver.com/${cafeSlug}/${id}`,
    title: a.subject ?? "",
    text,
    created_at: a.writeDate ? new Date(a.writeDate).toISOString() : null,
    author: {
      id: a.writer?.memberKey ?? "",
      nickname: a.writer?.nick ?? ""
    },
    board: {
      id: String(a.menu?.id ?? ""),
      name: decodeHtmlEntities(a.menu?.name ?? "")
    },
    head: a.head ?? null,
    metrics: {
      views: a.readCount ?? 0,
      comments: a.commentCount ?? 0,
      likes: likeMap?.get(id) ?? 0,
      scraps: a.scrapCount ?? 0,
      reposts: a.repostCount ?? 0
    },
    has_image: (a.contentHtml ?? "").includes("<img"),
    type: "post",
    platform: "naver_cafe"
  };
}
function buildFilter5(opts = {}) {
  const since = opts.since ? new Date(opts.since) : null;
  const until = opts.until ? new Date(opts.until) : null;
  const keyword = opts.keyword ? opts.keyword.toLowerCase() : null;
  return (p) => {
    if (since || until) {
      const d = new Date(p.created_at);
      if (since && d < since) return false;
      if (until && d > until) return false;
    }
    if (keyword && !`${p.title} ${p.text}`.toLowerCase().includes(keyword)) return false;
    return true;
  };
}
async function scrapeNaverCafe(target, page, opts = {}) {
  const { max = 1e3, debug = false, ...filterOpts } = opts;
  const dbg = (...m) => debug && console.log("[DBG]", ...m);
  const filterFn = buildFilter5(filterOpts);
  let clubId = null;
  let memberCount = null;
  let menuList = null;
  const likeMap = /* @__PURE__ */ new Map();
  const idList = [];
  const idSet = /* @__PURE__ */ new Set();
  const onResponse = async (response) => {
    if (response.status() !== 200) return;
    if (!(response.headers()["content-type"] ?? "").includes("json")) return;
    let json;
    try {
      json = await response.json();
    } catch {
      return;
    }
    if (!clubId) {
      const id = extractClubId(json);
      if (id) {
        clubId = String(id);
        dbg(`clubId: ${clubId}`);
      }
    }
    if (memberCount === null) {
      const mc = extractMemberCount(json);
      if (mc != null) {
        memberCount = Number(mc);
        dbg(`memberCount: ${memberCount}`);
      }
    }
    if (!menuList) {
      const menus = extractMenus(json);
      if (menus?.length) {
        menuList = menus;
        dbg(`${menus.length} boards`);
      }
    }
    const entries = extractArticleIds(json);
    if (entries?.length) {
      for (const e of entries) {
        if (!idSet.has(e.id)) {
          idSet.add(e.id);
          idList.push(e.id);
          likeMap.set(e.id, e.likeCount);
        }
      }
      dbg(`+${entries.length} IDs (total: ${idSet.size})`);
    }
  };
  page.on("response", onResponse);
  try {
    await page.goto(target.cafeUrl, { waitUntil: "domcontentloaded", timeout: 6e4 });
    await delay3(NAV_DELAY2);
    if (!clubId) {
      clubId = await extractClubIdFromDOM(page);
      dbg(`clubId from DOM: ${clubId}`);
    }
    if (!clubId) {
      console.error("[ERROR] Could not determine caf\xE9 ID.");
      return { posts: [], memberCount: null };
    }
    console.log(`  clubId      : ${clubId}`);
    if (memberCount !== null) console.log(`  Members     : ${memberCount.toLocaleString()}`);
    const boards = target.menuId ? [{ id: target.menuId, name: "(specified)" }] : menuList?.length ? menuList : [{ id: "0", name: "All" }];
    console.log(`  Boards      : ${boards.length}`);
    for (const board of boards) {
      if (idSet.size >= max) break;
      let pageNum = 1;
      let stale = 0;
      while (idSet.size < max && stale < 3) {
        const prevSize = idSet.size;
        const iframePath = `/ArticleList.nhn?search.clubid=${clubId}&search.menuid=${board.id}&search.page=${pageNum}&userDisplay=${PAGE_SIZE}&search.boardtype=L`;
        const listUrl = `https://cafe.naver.com/${target.slug}?iframe_url=${encodeURIComponent(iframePath)}`;
        console.log(`Board "${board.name}" \u2014 page ${pageNum} (${idSet.size} IDs)`);
        await page.goto(listUrl, { waitUntil: "domcontentloaded", timeout: 3e4 });
        await delay3(NAV_DELAY2);
        const added = idSet.size - prevSize;
        if (!added) {
          stale++;
        } else {
          stale = 0;
        }
        if (idSet.size >= max) break;
        if (added > 0 && added < PAGE_SIZE) break;
        pageNum++;
        await delay3(300);
      }
    }
  } finally {
    page.off("response", onResponse);
  }
  const cappedIds = idList.slice(0, max);
  if (!cappedIds.length) return { posts: [], memberCount };
  console.log(`  Fetching ${cappedIds.length} article details...`);
  const idEntries = cappedIds.map((id) => ({ id }));
  const details = await fetchArticleDetails(clubId, idEntries, likeMap, dbg);
  const posts = [];
  for (const result of details) {
    const parsed = parseArticleDetail(result, target.slug, likeMap);
    if (parsed && filterFn(parsed)) posts.push(parsed);
  }
  return {
    posts: posts.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)),
    memberCount
  };
}
async function scrapeNaver(targets, opts = {}) {
  const parsed = (Array.isArray(targets) ? targets : [targets]).map((t) => typeof t === "string" ? parseNaverCafe(t) : t).filter(Boolean);
  if (!parsed.length) throw new Error("No valid Naver Caf\xE9 URL provided.");
  const {
    headed = false,
    debug = false,
    resetSession = false,
    sessionDir = DEFAULT_SESSION_DIR4,
    ...cafeOpts
  } = opts;
  if (resetSession && existsSync5(sessionDir))
    rmSync4(sessionDir, { recursive: true, force: true });
  if (!sessionExists3(sessionDir) && !headed)
    throw new Error("No saved session. Run with --headed to log in first.");
  const context = await createBrowser3(sessionDir, !headed);
  try {
    const loginPage = await context.newPage();
    await loginPage.goto("https://www.naver.com", { waitUntil: "domcontentloaded", timeout: 6e4 });
    await delay3(2e3);
    if (!await isLoggedIn2(loginPage)) {
      if (!headed) {
        await context.close();
        throw new Error("Session expired. Run with --headed to re-login.");
      }
      const ok = await waitForLogin3(loginPage);
      if (!ok) throw new Error("Login timed out.");
      console.log("\nLogin confirmed. Starting scrape...");
    } else {
      console.log("Session active.");
    }
    await loginPage.close();
    const page = await setupPage4(context);
    const results = {};
    for (const target of parsed) {
      console.log(`
${"\u2550".repeat(52)}`);
      console.log(`  ${target.slug}  [Naver Caf\xE9]`);
      console.log(`${"\u2550".repeat(52)}`);
      results[target.slug] = await scrapeNaverCafe(target, page, { debug, ...cafeOpts });
    }
    return results;
  } finally {
    await context.close();
  }
}

// src/platforms/naver/output.js
function toNaverJSON(posts, memberCount = null) {
  return JSON.stringify({ memberCount, posts }, null, 2);
}

// src/platforms/youtube/scraper.js
import { execFile } from "child_process";
import { promisify } from "util";
import { existsSync as existsSync6, mkdirSync as mkdirSync6, writeFileSync as writeFileSync4, unlinkSync } from "fs";
import { resolve as resolve7, join as join4 } from "path";
import { google } from "googleapis";
var execFileAsync = promisify(execFile);
var API_KEY_ENV = "YOUTUBE_API_KEY";
function parseYouTubeChannel(raw) {
  if (typeof raw !== "string") return null;
  raw = raw.trim();
  const urlPatterns = [
    [/youtube\.com\/@([A-Za-z0-9._-]+)/, "handle"],
    [/youtube\.com\/channel\/(UC[\w-]{20,})/, "channelId"],
    [/youtube\.com\/c\/([A-Za-z0-9._-]+)/, "handle"],
    [/youtube\.com\/user\/([A-Za-z0-9._-]+)/, "handle"]
  ];
  for (const [re, key] of urlPatterns) {
    const m2 = raw.match(re);
    if (m2) return { [key]: m2[1] };
  }
  if (/^UC[\w-]{20,}$/.test(raw)) return { channelId: raw };
  const m = raw.match(/^@?([A-Za-z0-9._-]+)$/);
  if (m) return { handle: m[1] };
  return null;
}
function makeClient(apiKey) {
  return google.youtube({ version: "v3", auth: apiKey });
}
async function fetchChannel(yt, target) {
  const params = { part: ["snippet", "statistics", "contentDetails"] };
  if (target.channelId) {
    params.id = [target.channelId];
  } else {
    params.forHandle = `@${target.handle.replace(/^@/, "")}`;
  }
  const res = await yt.channels.list(params);
  const ch = res.data.items?.[0];
  if (!ch) throw new Error(`Channel not found: ${JSON.stringify(target)}`);
  const sn = ch.snippet ?? {};
  const st = ch.statistics ?? {};
  const cd = ch.contentDetails?.relatedPlaylists ?? {};
  return {
    id: ch.id,
    handle: sn.customUrl ?? "",
    title: sn.title ?? "",
    description: sn.description ?? "",
    country: sn.country ?? "",
    created_at: sn.publishedAt ?? null,
    subscribers: Number(st.subscriberCount ?? 0),
    video_count: Number(st.videoCount ?? 0),
    view_count: Number(st.viewCount ?? 0),
    uploads_playlist: cd.uploads ?? "",
    platform: "youtube"
  };
}
async function fetchVideoIds(yt, uploadsPlaylistId, max) {
  const ids = [];
  let pageToken;
  while (ids.length < max) {
    const res = await yt.playlistItems.list({
      part: ["contentDetails"],
      playlistId: uploadsPlaylistId,
      maxResults: Math.min(50, max - ids.length),
      pageToken
    });
    for (const item of res.data.items ?? []) {
      const vid = item.contentDetails?.videoId;
      if (vid) ids.push(vid);
    }
    pageToken = res.data.nextPageToken;
    if (!pageToken) break;
  }
  return ids;
}
async function fetchVideoDetails(yt, videoIds) {
  const videos = [];
  for (let i = 0; i < videoIds.length; i += 50) {
    const batch = videoIds.slice(i, i + 50);
    const res = await yt.videos.list({
      part: ["snippet", "statistics", "contentDetails"],
      id: batch
    });
    for (const item of res.data.items ?? []) {
      const v = parseYouTubeVideo(item);
      if (v) videos.push(v);
    }
  }
  return videos;
}
function parseDuration(iso) {
  const m = (iso ?? "").match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
}
function parseYouTubeVideo(item) {
  if (!item?.id) return null;
  const sn = item.snippet ?? {};
  const st = item.statistics ?? {};
  const cd = item.contentDetails ?? {};
  const thumbs = sn.thumbnails ?? {};
  const thumbnail = thumbs.maxres?.url ?? thumbs.high?.url ?? thumbs.medium?.url ?? "";
  return {
    id: item.id,
    url: `https://www.youtube.com/watch?v=${item.id}`,
    thumbnail,
    download_url: `https://www.youtube.com/watch?v=${item.id}`,
    title: sn.title ?? "",
    description: sn.description ?? "",
    created_at: sn.publishedAt ?? null,
    duration: parseDuration(cd.duration),
    author: {
      id: sn.channelId ?? "",
      username: sn.channelTitle ?? ""
    },
    metrics: {
      views: Number(st.viewCount ?? 0),
      likes: Number(st.likeCount ?? 0),
      comments: Number(st.commentCount ?? 0)
    },
    tags: sn.tags ?? [],
    transcript: "",
    platform: "youtube"
  };
}
async function fetchTranscript(videoId, langs = "ja,en") {
  const tmpDir = resolve7(".tmp-yt-transcripts");
  mkdirSync6(tmpDir, { recursive: true });
  const outTemplate = join4(tmpDir, `${videoId}`);
  try {
    await execFileAsync("yt-dlp", [
      "--write-auto-sub",
      "--sub-lang",
      langs,
      "--sub-format",
      "vtt",
      "--skip-download",
      "--no-playlist",
      "-o",
      outTemplate,
      `https://www.youtube.com/watch?v=${videoId}`
    ], { timeout: 3e4 });
    for (const lang of langs.split(",")) {
      const vttPath = `${outTemplate}.${lang}.vtt`;
      if (existsSync6(vttPath)) {
        const { readFileSync: readFileSync7 } = await import("fs");
        const raw = readFileSync7(vttPath, "utf-8");
        unlinkSync(vttPath);
        return cleanVtt(raw);
      }
    }
    return "";
  } catch {
    return "";
  }
}
function cleanVtt(vtt) {
  return vtt.split("\n").filter((l) => !l.startsWith("WEBVTT") && !l.match(/^\d{2}:\d{2}/) && l.trim()).map((l) => l.replace(/<[^>]+>/g, "").trim()).filter((l, i, arr) => l && l !== arr[i - 1]).join(" ").trim();
}
function buildFilter6(opts = {}) {
  const since = opts.since ? new Date(opts.since) : null;
  const until = opts.until ? new Date(opts.until) : null;
  const keyword = opts.keyword ? opts.keyword.toLowerCase() : null;
  return (v) => {
    if (since || until) {
      const d = new Date(v.created_at);
      if (since && d < since) return false;
      if (until && d > until) return false;
    }
    if (keyword && !(v.title + " " + v.description).toLowerCase().includes(keyword)) return false;
    return true;
  };
}
async function scrapeYouTubeChannel(target, apiKey, opts = {}) {
  const {
    max = 1e3,
    transcript = false,
    transcriptLangs = "ja,en",
    debug = false,
    ...filterOpts
  } = opts;
  const dbg = (...m) => debug && console.log("[DBG]", ...m);
  const filterFn = buildFilter6(filterOpts);
  const yt = makeClient(apiKey);
  const profile = await fetchChannel(yt, target);
  dbg(`channel: ${profile.title} \u2014 ${profile.subscribers} subscribers`);
  if (!profile.uploads_playlist) throw new Error("No uploads playlist found.");
  console.log("Fetching video list...");
  const videoIds = await fetchVideoIds(yt, profile.uploads_playlist, max);
  console.log(`${videoIds.length} videos found`);
  console.log("Fetching video details...");
  let videos = await fetchVideoDetails(yt, videoIds);
  console.log("Video details done");
  videos = videos.filter(filterFn).sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, max);
  if (transcript && videos.length > 0) {
    console.log(`  Fetching transcripts for ${videos.length} videos...`);
    for (let i = 0; i < videos.length; i++) {
      const v = videos[i];
      v.transcript = await fetchTranscript(v.id, transcriptLangs);
      console.log(`Transcripts: ${i + 1}/${videos.length}`);
      dbg(`${v.id}: transcript ${v.transcript ? v.transcript.length + " chars" : "empty"}`);
    }
  }
  return { profile, videos };
}
async function scrapeYouTube(targets, opts = {}) {
  const {
    apiKey = process.env[API_KEY_ENV],
    debug = false,
    ...channelOpts
  } = opts;
  if (!apiKey) {
    throw new Error(
      `YouTube API key required.
  Set env var: $env:${API_KEY_ENV}="YOUR_KEY"
  Or pass:     --api-key YOUR_KEY`
    );
  }
  const parsed = (Array.isArray(targets) ? targets : [targets]).map((t) => typeof t === "string" ? parseYouTubeChannel(t) : t).filter(Boolean);
  if (!parsed.length) throw new Error("No valid YouTube channel provided.");
  const results = {};
  for (const target of parsed) {
    const label = target.channelId ?? `@${target.handle}`;
    console.log(`
${"\u2550".repeat(52)}`);
    console.log(`  ${label}  [YouTube]`);
    console.log(`${"\u2550".repeat(52)}`);
    results[label] = await scrapeYouTubeChannel(target, apiKey, { debug, ...channelOpts });
  }
  return results;
}

// src/platforms/youtube/output.js
function toYouTubeJSON(profile, videos) {
  return JSON.stringify({ profile, videos }, null, 2);
}

// src/tui/runner.js
var PLATFORMS = [
  {
    value: "twitter",
    label: "Twitter / X",
    needsBrowser: true,
    targetsLabel: "\u7528\u6237\u540D",
    targetsHint: "username\uFF0C\u591A\u4E2A\u7528\u9017\u53F7\u5206\u9694"
  },
  {
    value: "tiktok",
    label: "TikTok",
    needsBrowser: true,
    targetsLabel: "\u7528\u6237\u540D",
    targetsHint: "@username\uFF0C\u591A\u4E2A\u7528\u9017\u53F7\u5206\u9694"
  },
  {
    value: "reddit",
    label: "Reddit",
    needsBrowser: false,
    targetsLabel: "\u76EE\u6807",
    targetsHint: "r/subreddit \u6216 u/username\uFF0C\u591A\u4E2A\u7528\u9017\u53F7\u5206\u9694"
  },
  {
    value: "threads",
    label: "Threads",
    needsBrowser: true,
    targetsLabel: "\u7528\u6237\u540D",
    targetsHint: "@username\uFF0C\u591A\u4E2A\u7528\u9017\u53F7\u5206\u9694"
  },
  {
    value: "pixiv",
    label: "Pixiv",
    needsBrowser: true,
    targetsLabel: "\u7528\u6237 ID",
    targetsHint: "\u6570\u5B57 ID \u6216\u4E3B\u9875 URL\uFF0C\u591A\u4E2A\u7528\u9017\u53F7\u5206\u9694"
  },
  {
    value: "naver",
    label: "Naver Caf\xE9",
    needsBrowser: true,
    targetsLabel: "Caf\xE9 URL",
    targetsHint: "\u5B8C\u6574 URL\uFF0C\u591A\u4E2A\u7528\u9017\u53F7\u5206\u9694"
  },
  {
    value: "youtube",
    label: "YouTube",
    needsBrowser: false,
    needsApiKey: true,
    targetsLabel: "\u9891\u9053",
    targetsHint: "@handle \u6216\u9891\u9053 URL\uFF0C\u591A\u4E2A\u7528\u9017\u53F7\u5206\u9694"
  }
];
function parseTargets(raw) {
  return raw.split(",").map((t) => t.trim()).filter(Boolean);
}
function sessionStamp() {
  const d = /* @__PURE__ */ new Date();
  const date = d.toISOString().slice(0, 10);
  const time = d.toTimeString().slice(0, 8).replace(/:/g, "");
  return `${date}_${time}`;
}
async function runScrape(config) {
  if (Array.isArray(config)) {
    const allFiles = [];
    let totalCount2 = 0;
    for (const c of config) {
      const res = await runScrape(c);
      allFiles.push(...res.savedFiles);
      totalCount2 += res.totalCount;
    }
    return { savedFiles: allFiles, totalCount: totalCount2 };
  }
  const {
    platform,
    targets: rawTargets,
    max = "200",
    since,
    until,
    headed = false,
    apiKey,
    redditSource = "arctic",
    outDir = "./out/"
  } = config;
  const targets = parseTargets(rawTargets);
  const opts = {
    max: parseInt(max, 10) || 200,
    since: since || void 0,
    until: until || void 0,
    headed: !!headed,
    debug: false
  };
  const baseDir = resolve8(outDir);
  const platformDir = join5(baseDir, platform);
  mkdirSync7(platformDir, { recursive: true });
  const stamp = sessionStamp();
  const savedFiles = [];
  let totalCount = 0;
  const save2 = (name, content, count, label) => {
    const file = join5(platformDir, name);
    writeFileSync5(file, content);
    savedFiles.push({ file, count, label });
    totalCount += count;
  };
  if (platform === "twitter") {
    const results = await scrape(targets, opts);
    for (const [username, tweets] of Object.entries(results)) {
      if (!tweets.length) continue;
      const profile = tweets[0]?.author ? { ...tweets[0].author, platform: "twitter" } : null;
      save2(`${stamp}_${username}.json`, toJSON(profile, tweets), tweets.length, `@${username}`);
    }
  } else if (platform === "tiktok") {
    const parsed = targets.map((t) => parseTikTokUser(t) ?? t);
    const results = await scrapeTikTok(parsed, opts);
    for (const [username, { profile, videos }] of Object.entries(results)) {
      if (!videos.length) continue;
      save2(`${stamp}_${username}.json`, toTikTokJSON(profile, videos), videos.length, `@${username}`);
    }
  } else if (platform === "reddit") {
    const fn = redditSource === "reddit" ? scrapeReddit : scrapeArctic;
    const results = await fn(targets, opts);
    for (const [target, items] of Object.entries(results)) {
      if (!items.length) continue;
      const safeName = target.replace(/\//g, "_");
      save2(`${stamp}_${safeName}.json`, toRedditJSON(items), items.length, target);
    }
  } else if (platform === "threads") {
    const results = await scrapeThreads(targets, opts);
    for (const [username, threads] of Object.entries(results)) {
      if (!threads.length) continue;
      save2(`${stamp}_${username}.json`, toThreadsJSON(threads), threads.length, `@${username}`);
    }
  } else if (platform === "pixiv") {
    const results = await scrapePixiv(targets, opts);
    for (const [target, { artworks }] of Object.entries(results)) {
      if (!artworks.length) continue;
      save2(`${stamp}_${target}.json`, toPixivJSON(artworks), artworks.length, `Pixiv:${target}`);
    }
  } else if (platform === "naver") {
    const results = await scrapeNaver(targets, opts);
    for (const [url, { cafe, posts }] of Object.entries(results)) {
      if (!posts.length) continue;
      const name = (cafe?.name ?? url).replace(/[^a-z0-9_\-]/gi, "_");
      save2(`${stamp}_${name}.json`, toNaverJSON(posts, cafe?.memberCount), posts.length, name);
    }
  } else if (platform === "youtube") {
    const ytKey = apiKey || process.env.YOUTUBE_API_KEY;
    const results = await scrapeYouTube(targets, { ...opts, apiKey: ytKey });
    for (const [target, { profile, videos }] of Object.entries(results)) {
      if (!videos.length) continue;
      const name = (profile?.handle ?? target).replace(/[@/]/g, "");
      save2(`${stamp}_${name}.json`, toYouTubeJSON(profile, videos), videos.length, profile?.title ?? target);
    }
  }
  return { savedFiles, totalCount };
}

// src/tui/screens/ScrapeSetup.js
import { readFileSync as readFileSync3, existsSync as existsSync7 } from "fs";
import { resolve as resolve9 } from "path";
import { homedir as homedir2 } from "os";
import { jsx as jsx8, jsxs as jsxs8 } from "react/jsx-runtime";
var PLATFORM_ITEMS = PLATFORMS.map((p) => ({ label: p.label, value: p.value }));
function parseTargetsInput(raw) {
  const t = raw.trim();
  const looksLikePath = t.startsWith("./") || t.startsWith("../") || t.startsWith("/") || t.startsWith("~") || /\.(txt|csv)$/i.test(t);
  if (looksLikePath) {
    try {
      const abs = resolve9(t.startsWith("~") ? t.replace(/^~/, homedir2()) : t);
      if (existsSync7(abs)) {
        const lines = readFileSync3(abs, "utf-8").split("\n").map((l) => l.trim()).filter(Boolean);
        return lines.join(",");
      }
    } catch {
    }
  }
  return t;
}
function buildSteps(platforms) {
  const steps = [
    { key: "platforms", short: "\u5E73\u53F0", label: "\u9009\u62E9\u5E73\u53F0", type: "multi-select" }
  ];
  for (const pv of platforms) {
    const meta = PLATFORMS.find((p) => p.value === pv);
    steps.push({
      key: `targets_${pv}`,
      short: meta?.label ?? pv,
      label: `${meta?.label ?? pv} \u76EE\u6807`,
      type: "text",
      hint: `${meta?.targetsHint ?? "\u591A\u4E2A\u7528\u9017\u53F7\u5206\u9694"}
\u6216\u8F93\u5165 .txt \u6587\u4EF6\u8DEF\u5F84\uFF08\u6BCF\u884C\u4E00\u4E2A\u76EE\u6807\uFF09`,
      platform: pv
    });
  }
  steps.push({ key: "max", short: "\u4E0A\u9650", label: "\u91C7\u96C6\u4E0A\u9650", type: "text", hint: "\u9ED8\u8BA4 200 \u6761/\u76EE\u6807" });
  steps.push({ key: "since", short: "\u5F00\u59CB", label: "\u5F00\u59CB\u65E5\u671F", type: "text", hint: "YYYY-MM-DD\uFF0C\u7559\u7A7A\u8DF3\u8FC7" });
  steps.push({ key: "until", short: "\u7ED3\u675F", label: "\u7ED3\u675F\u65E5\u671F", type: "text", hint: "YYYY-MM-DD\uFF0C\u7559\u7A7A\u8DF3\u8FC7" });
  const needsBrowser = platforms.some((pv) => PLATFORMS.find((p) => p.value === pv)?.needsBrowser);
  if (needsBrowser) {
    steps.push({
      key: "headed",
      short: "\u6D4F\u89C8\u5668",
      label: "\u6D4F\u89C8\u5668\u6A21\u5F0F",
      type: "select",
      items: [
        { label: "\u65E0\u754C\u9762\uFF08\u63A8\u8350\uFF09", value: "false" },
        { label: "\u663E\u793A\u7A97\u53E3", value: "true" }
      ]
    });
  }
  if (platforms.includes("youtube") && !process.env.YOUTUBE_API_KEY) {
    steps.push({
      key: "youtubeKey",
      short: "YT Key",
      label: "YouTube API Key",
      type: "text",
      hint: "\u6216\u63D0\u524D\u5728\u8BBE\u7F6E\u4E2D\u914D\u7F6E"
    });
  }
  if (platforms.includes("reddit")) {
    steps.push({
      key: "redditSource",
      short: "\u6570\u636E\u6E90",
      label: "Reddit \u6570\u636E\u6E90",
      type: "select",
      items: [
        { label: "Arctic Shift\uFF08\u5FEB\uFF09", value: "arctic" },
        { label: "Reddit \u5B98\u65B9", value: "reddit" }
      ]
    });
  }
  return steps;
}
function Indicator2({ isSelected }) {
  return /* @__PURE__ */ jsx8(Box8, { marginRight: 1, children: isSelected ? /* @__PURE__ */ jsx8(Text8, { color: "cyan", bold: true, children: SYM.cursor }) : /* @__PURE__ */ jsx8(Text8, { children: " " }) });
}
function Item2({ label, isSelected }) {
  return /* @__PURE__ */ jsx8(Text8, { color: isSelected ? "white" : "gray", children: label });
}
function ScrapeSetup({ onNav }) {
  const [selectedPlatforms, setSelectedPlatforms] = useState5([]);
  const [config, setConfig2] = useState5({});
  const [stepIdx, setStepIdx] = useState5(0);
  const [draft, setDraft] = useState5("");
  const steps = useMemo(() => buildSteps(selectedPlatforms), [selectedPlatforms]);
  const step = steps[stepIdx];
  const stepLabels = steps.map((s) => s.short);
  useInput5((_, key) => {
    if (!key.escape) return;
    if (stepIdx === 0) {
      onNav("menu");
      return;
    }
    setStepIdx((i) => i - 1);
    setDraft("");
  });
  const handlePlatformConfirm = (platforms) => {
    setSelectedPlatforms(platforms);
    setConfig2({});
    setStepIdx(1);
    setDraft("");
  };
  const advance = (value) => {
    let val = value !== void 0 ? String(value) : draft;
    if (step.platform) val = parseTargetsInput(val);
    else val = val.trim();
    const next = { ...config, [step.key]: val };
    setConfig2(next);
    const currentSteps = buildSteps(selectedPlatforms);
    if (stepIdx + 1 >= currentSteps.length) {
      const outDir = getConfig().outDir || "./out/";
      const shared = {
        max: next.max || "200",
        since: next.since || "",
        until: next.until || "",
        headed: next.headed === "true",
        outDir,
        redditSource: next.redditSource || "arctic",
        apiKey: next.youtubeKey || process.env.YOUTUBE_API_KEY
      };
      const platformConfigs = selectedPlatforms.map((pv) => ({
        platform: pv,
        targets: next[`targets_${pv}`] ?? "",
        ...shared
      }));
      onNav("scrape-run", { scrapeConfig: platformConfigs });
    } else {
      setStepIdx((i) => i + 1);
      setDraft("");
    }
  };
  if (!step) return null;
  const doneSteps = steps.slice(0, stepIdx);
  return /* @__PURE__ */ jsxs8(Box8, { flexDirection: "column", paddingX: 2, paddingY: 1, gap: 1, children: [
    /* @__PURE__ */ jsx8(Text8, { bold: true, color: "cyan", children: "\u91C7\u96C6\u8BBE\u7F6E" }),
    /* @__PURE__ */ jsx8(StepBar, { steps: stepLabels, current: stepIdx }),
    doneSteps.length > 0 && /* @__PURE__ */ jsx8(
      Box8,
      {
        flexDirection: "column",
        borderStyle: "round",
        borderColor: "green",
        borderDimColor: true,
        paddingX: 2,
        children: doneSteps.map((s) => {
          let display;
          if (s.key === "platforms") {
            display = selectedPlatforms.map((pv) => PLATFORMS.find((p) => p.value === pv)?.label ?? pv).join(", ");
          } else {
            display = config[s.key] || "\uFF08\u8DF3\u8FC7\uFF09";
          }
          return /* @__PURE__ */ jsxs8(Box8, { gap: 2, children: [
            /* @__PURE__ */ jsx8(Text8, { color: "green", children: SYM.check }),
            /* @__PURE__ */ jsx8(Text8, { color: "gray", dimColor: true, children: s.label.padEnd(12) }),
            /* @__PURE__ */ jsx8(Text8, { color: "white", wrap: "truncate", children: display })
          ] }, s.key);
        })
      }
    ),
    /* @__PURE__ */ jsxs8(
      Box8,
      {
        flexDirection: "column",
        borderStyle: "round",
        borderColor: "cyan",
        paddingX: 2,
        paddingY: 0,
        marginTop: 1,
        gap: 1,
        children: [
          /* @__PURE__ */ jsx8(Text8, { bold: true, color: "cyan", children: step.label }),
          step.hint && step.hint.split("\n").map((h, i) => /* @__PURE__ */ jsx8(Text8, { color: "gray", dimColor: true, children: h }, i)),
          step.type === "multi-select" && /* @__PURE__ */ jsx8(MultiSelect, { items: PLATFORM_ITEMS, onConfirm: handlePlatformConfirm }),
          step.type === "select" && /* @__PURE__ */ jsx8(
            SelectInput3,
            {
              items: step.items,
              onSelect: ({ value }) => advance(value),
              indicatorComponent: Indicator2,
              itemComponent: Item2
            }
          ),
          step.type === "text" && /* @__PURE__ */ jsxs8(Box8, { gap: 1, children: [
            /* @__PURE__ */ jsx8(Text8, { color: "cyan", children: SYM.cursor }),
            /* @__PURE__ */ jsx8(
              TextInput3,
              {
                value: draft,
                onChange: setDraft,
                onSubmit: () => advance(),
                placeholder: step.hint?.split("\n")[0] ?? ""
              }
            )
          ] })
        ]
      }
    ),
    /* @__PURE__ */ jsx8(KeyBar, { hints: [
      ...step.type === "multi-select" ? [{ key: "Space", label: "\u5207\u6362\u9009\u62E9" }] : [{ key: "Enter", label: "\u786E\u8BA4" }],
      { key: "ESC", label: stepIdx === 0 ? "\u8FD4\u56DE\u83DC\u5355" : "\u4E0A\u4E00\u6B65" }
    ] })
  ] });
}

// src/tui/screens/ScrapeRun.js
import React9, { useState as useState6, useEffect as useEffect2, useRef } from "react";
import { Box as Box9, Text as Text9, useInput as useInput6 } from "ink";
import { jsx as jsx9, jsxs as jsxs9 } from "react/jsx-runtime";
function fmtElapsed(secs) {
  const m = Math.floor(secs / 60).toString().padStart(2, "0");
  const s = (secs % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}
function logColor(line) {
  if (line.startsWith("[ERR]")) return "red";
  if (line.startsWith("[WARN]")) return "yellow";
  return "gray";
}
function LogLine({ text }) {
  const color = logColor(text);
  const prefix = text.startsWith("[ERR]") ? `${SYM.cross} ` : text.startsWith("[WARN]") ? `${SYM.warn}  ` : "  ";
  const body = text.replace(/^\[(ERR|WARN)\] /, "");
  return /* @__PURE__ */ jsxs9(Box9, { gap: 0, children: [
    /* @__PURE__ */ jsx9(Text9, { color, children: prefix }),
    /* @__PURE__ */ jsx9(Text9, { color, dimColor: true, wrap: "truncate", children: body })
  ] });
}
function useElapsed(active) {
  const [secs, setSecs] = useState6(0);
  useEffect2(() => {
    if (!active) return;
    const id = setInterval(() => setSecs((s) => s + 1), 1e3);
    return () => clearInterval(id);
  }, [active]);
  return secs;
}
var RECENT_LINES = 5;
function ScrapeRun({ config, onNav }) {
  const [recentLogs, setRecentLogs] = useState6([]);
  const [status, setStatus] = useState6("running");
  const [result, setResult] = useState6(null);
  const [errorMsg, setError] = useState6("");
  const rawRef = useRef([]);
  const committed = useRef(0);
  const elapsed = useElapsed(status === "running");
  useInput6((input, key) => {
    if (key.escape && status !== "running") {
      onNav("menu");
      return;
    }
    if (key.return && status === "done" && result) {
      const saved = getConfig();
      const outDir = Array.isArray(config) ? config[0]?.outDir ?? "./out/" : config?.outDir ?? "./out/";
      onNav("classify-run", {
        classifyConfig: {
          inputFiles: result.savedFiles.map((f) => f.file),
          model: saved.model || "gpt-4.1-mini",
          outDir,
          wait: false
        }
      });
    }
    if ((input === "p" || input === "P") && status === "done" && result?.savedFiles?.length) {
      onNav("data-preview", { previewFile: result.savedFiles[0].file });
    }
  });
  useEffect2(() => {
    let cancelled = false;
    const orig = {
      log: console.log.bind(console),
      error: console.error.bind(console),
      warn: console.warn.bind(console)
    };
    const push = (...args) => {
      const line = args.map((a) => typeof a === "string" ? a : JSON.stringify(a)).join(" ");
      rawRef.current.push(line);
    };
    console.log = push;
    console.error = (...a) => push("[ERR] " + a.join(" "));
    console.warn = (...a) => push("[WARN] " + a.join(" "));
    const flush = () => {
      if (cancelled) return;
      const all = rawRef.current;
      if (all.length <= committed.current) return;
      committed.current = all.length;
      setRecentLogs(all.slice(-RECENT_LINES));
    };
    const timer = setInterval(flush, 500);
    runScrape(config).then((res) => {
      if (!cancelled) {
        setResult(res);
        setStatus("done");
      }
    }).catch((err) => {
      if (!cancelled) {
        setError(err.message ?? String(err));
        setStatus("error");
      }
    }).finally(() => {
      clearInterval(timer);
      flush();
      Object.assign(console, orig);
    });
    return () => {
      cancelled = true;
      clearInterval(timer);
      Object.assign(console, orig);
    };
  }, []);
  const statusColor = status === "error" ? "red" : status === "done" ? "green" : "cyan";
  return /* @__PURE__ */ jsxs9(Box9, { flexDirection: "column", paddingX: 2, paddingY: 1, gap: 1, children: [
    /* @__PURE__ */ jsxs9(
      Box9,
      {
        flexDirection: "column",
        borderStyle: "round",
        borderColor: statusColor,
        paddingX: 2,
        paddingY: 0,
        children: [
          /* @__PURE__ */ jsxs9(Box9, { gap: 2, children: [
            /* @__PURE__ */ jsx9(Text9, { bold: true, color: statusColor, children: status === "running" ? `${SYM.run} \u91C7\u96C6\u8FD0\u884C\u4E2D` : status === "done" ? `${SYM.check} \u91C7\u96C6\u5B8C\u6210` : `${SYM.cross} \u51FA\u9519` }),
            status === "running" && /* @__PURE__ */ jsx9(Text9, { color: "gray", dimColor: true, children: fmtElapsed(elapsed) })
          ] }),
          status === "running" && (recentLogs.length === 0 ? /* @__PURE__ */ jsx9(Text9, { color: "gray", dimColor: true, children: "  \u6B63\u5728\u542F\u52A8..." }) : recentLogs.map((line, i) => /* @__PURE__ */ jsx9(LogLine, { text: line }, i))),
          status === "error" && /* @__PURE__ */ jsxs9(Text9, { color: "red", wrap: "truncate", children: [
            "  ",
            errorMsg
          ] })
        ]
      }
    ),
    status === "done" && result && /* @__PURE__ */ jsxs9(
      Box9,
      {
        flexDirection: "column",
        borderStyle: "round",
        borderColor: "green",
        paddingX: 2,
        paddingY: 0,
        children: [
          /* @__PURE__ */ jsxs9(Text9, { bold: true, color: "green", children: [
            SYM.check,
            " \u5171\u91C7\u96C6 ",
            result.totalCount,
            " \u6761\u5185\u5BB9"
          ] }),
          result.savedFiles.map(({ file, count, label }) => /* @__PURE__ */ jsxs9(Box9, { gap: 2, children: [
            /* @__PURE__ */ jsx9(Text9, { color: "gray", dimColor: true, children: SYM.arrow }),
            /* @__PURE__ */ jsx9(Text9, { color: "cyan", children: label }),
            /* @__PURE__ */ jsxs9(Text9, { color: "gray", dimColor: true, children: [
              count,
              " \u6761"
            ] }),
            /* @__PURE__ */ jsx9(Text9, { color: "gray", dimColor: true, wrap: "truncate", children: file })
          ] }, file))
        ]
      }
    ),
    status !== "running" && /* @__PURE__ */ jsx9(KeyBar, { hints: [
      ...status === "done" ? [
        { key: "Enter", label: "\u7EE7\u7EED AI \u5206\u7C7B" },
        { key: "P", label: "\u9884\u89C8\u6570\u636E" }
      ] : [],
      { key: "ESC", label: "\u8FD4\u56DE\u4E3B\u83DC\u5355" }
    ] })
  ] });
}

// src/tui/screens/ClassifySetup.js
import React10, { useState as useState7, useMemo as useMemo2 } from "react";
import { Box as Box10, Text as Text10, useInput as useInput7 } from "ink";
import SelectInput4 from "ink-select-input";
import { readdirSync as readdirSync2, existsSync as existsSync8 } from "fs";
import { resolve as resolve10, join as join6, relative } from "path";
import { Fragment as Fragment2, jsx as jsx10, jsxs as jsxs10 } from "react/jsx-runtime";
var MODEL_ITEMS2 = [
  { label: "gpt-4.1-mini  \u5FEB\u901F\u7701\u94B1\uFF08\u63A8\u8350\uFF09", value: "gpt-4.1-mini" },
  { label: "gpt-4.1       \u9AD8\u7CBE\u5EA6", value: "gpt-4.1" },
  { label: "gpt-4o-mini   \u5907\u7528", value: "gpt-4o-mini" }
];
var STEPS2 = [
  { key: "inputFile", short: "\u6587\u4EF6", label: "\u9009\u62E9\u6587\u4EF6", type: "multi-files" },
  { key: "model", short: "\u6A21\u578B", label: "\u6A21\u578B", type: "select", items: MODEL_ITEMS2 }
];
function scanJsonFilesRecursive(dir) {
  const results = [];
  try {
    let walk = function(d) {
      let entries;
      try {
        entries = readdirSync2(d, { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of entries) {
        if (e.isDirectory()) {
          if (e.name !== "classified") walk(join6(d, e.name));
        } else if (e.name.endsWith(".json")) {
          const full = join6(d, e.name);
          results.push({ label: relative(abs, full), value: full });
        }
      }
    };
    const abs = resolve10(dir);
    if (!existsSync8(abs)) return [];
    walk(abs);
  } catch {
  }
  return results.sort((a, b) => b.label.localeCompare(a.label));
}
function Indicator3({ isSelected }) {
  return /* @__PURE__ */ jsx10(Box10, { marginRight: 1, children: isSelected ? /* @__PURE__ */ jsx10(Text10, { color: "cyan", bold: true, children: SYM.cursor }) : /* @__PURE__ */ jsx10(Text10, { children: " " }) });
}
function Item3({ label, isSelected }) {
  return /* @__PURE__ */ jsx10(Text10, { color: isSelected ? "white" : "gray", children: label });
}
function ClassifySetup({ onNav }) {
  const [config, setConfig2] = useState7({});
  const [stepIdx, setStepIdx] = useState7(0);
  const [draft, setDraft] = useState7("");
  const step = STEPS2[stepIdx];
  const stepLabels = STEPS2.map((s) => s.short);
  const saved = getConfig();
  const scanDir = saved.outDir || "./out/";
  const fileItems = useMemo2(() => scanJsonFilesRecursive(scanDir), [scanDir]);
  useInput7((_, key) => {
    if (key.escape) {
      if (stepIdx === 0) onNav("menu");
      else {
        setStepIdx((i) => i - 1);
        setDraft("");
      }
    }
  });
  const advance = (value) => {
    const isMulti = step.type === "multi-files";
    const val = isMulti ? value : (value ?? draft).trim();
    const next = { ...config, [step.key]: val };
    setConfig2(next);
    if (stepIdx + 1 >= STEPS2.length) {
      const model = next.model || saved.model || "gpt-4.1-mini";
      const outDir = scanDir;
      let inputFiles;
      const selected = next.inputFile;
      if (Array.isArray(selected) && selected.length > 0) {
        inputFiles = selected;
      } else {
        inputFiles = fileItems.map((f) => f.value);
      }
      onNav("classify-run", { classifyConfig: { inputFiles, model, outDir, wait: false } });
    } else {
      setStepIdx((i) => i + 1);
      setDraft("");
    }
  };
  if (!step) return null;
  const doneSteps = STEPS2.slice(0, stepIdx);
  return /* @__PURE__ */ jsxs10(Box10, { flexDirection: "column", paddingX: 2, paddingY: 1, gap: 1, children: [
    /* @__PURE__ */ jsx10(Text10, { bold: true, color: "cyan", children: "AI \u5206\u7C7B\u8BBE\u7F6E" }),
    /* @__PURE__ */ jsx10(StepBar, { steps: stepLabels, current: stepIdx }),
    doneSteps.length > 0 && /* @__PURE__ */ jsx10(
      Box10,
      {
        flexDirection: "column",
        borderStyle: "round",
        borderColor: "green",
        borderDimColor: true,
        paddingX: 2,
        marginTop: 1,
        children: doneSteps.map((s) => /* @__PURE__ */ jsxs10(Box10, { gap: 2, children: [
          /* @__PURE__ */ jsx10(Text10, { color: "green", children: SYM.check }),
          /* @__PURE__ */ jsx10(Text10, { color: "gray", dimColor: true, children: s.label.padEnd(6) }),
          /* @__PURE__ */ jsx10(Text10, { color: "white", children: s.key === "inputFile" ? Array.isArray(config[s.key]) && config[s.key].length > 0 ? `\u5DF2\u9009 ${config[s.key].length} \u4E2A\u6587\u4EF6` : "\u5168\u90E8\u6587\u4EF6" : config[s.key] || "\uFF08\u9ED8\u8BA4\uFF09" })
        ] }, s.key))
      }
    ),
    /* @__PURE__ */ jsxs10(
      Box10,
      {
        flexDirection: "column",
        borderStyle: "round",
        borderColor: "cyan",
        paddingX: 2,
        paddingY: 0,
        marginTop: 1,
        gap: 1,
        children: [
          /* @__PURE__ */ jsx10(Text10, { bold: true, color: "cyan", children: step.label }),
          /* @__PURE__ */ jsxs10(Text10, { color: "gray", dimColor: true, children: [
            "\u76EE\u5F55\uFF1A",
            scanDir
          ] }),
          step.type === "multi-files" ? fileItems.length === 0 ? /* @__PURE__ */ jsx10(Text10, { color: "gray", dimColor: true, children: "\u76EE\u5F55\u4E2D\u6682\u65E0 .json \u6587\u4EF6" }) : /* @__PURE__ */ jsxs10(Fragment2, { children: [
            /* @__PURE__ */ jsxs10(Text10, { color: "gray", dimColor: true, children: [
              "\u4E0D\u9009\u4EFB\u4F55\u6587\u4EF6 = \u5168\u9009\u76EE\u5F55\u4E2D\u6240\u6709\u6587\u4EF6\uFF08\u5171 ",
              fileItems.length,
              " \u4E2A\uFF09"
            ] }),
            /* @__PURE__ */ jsx10(MultiSelect, { items: fileItems, onConfirm: (vals) => advance(vals) })
          ] }) : /* @__PURE__ */ jsx10(
            SelectInput4,
            {
              items: step.items,
              onSelect: ({ value }) => advance(value),
              indicatorComponent: Indicator3,
              itemComponent: Item3
            }
          )
        ]
      }
    ),
    /* @__PURE__ */ jsx10(KeyBar, { hints: [
      { key: "Enter", label: "\u786E\u8BA4" },
      { key: "ESC", label: stepIdx === 0 ? "\u8FD4\u56DE\u83DC\u5355" : "\u4E0A\u4E00\u6B65" }
    ] })
  ] });
}

// src/tui/screens/ClassifyRun.js
import React12, { useState as useState8, useEffect as useEffect3, useRef as useRef2 } from "react";
import { Box as Box11, Text as Text12, useInput as useInput8 } from "ink";

// src/tui/components/StatusBadge.js
import React11 from "react";
import { Text as Text11 } from "ink";
import { jsxs as jsxs11 } from "react/jsx-runtime";
var STATUS_SYM = { pending: SYM.dot, completed: SYM.check, failed: SYM.cross };
function BatchBadge({ status }) {
  const color = BATCH_COLORS[status] ?? "gray";
  const label = BATCH_LABELS[status] ?? status;
  const symbol = STATUS_SYM[status] ?? SYM.dot;
  return /* @__PURE__ */ jsxs11(Text11, { color, children: [
    symbol,
    " ",
    label
  ] });
}
function RiskBadge({ level }) {
  const color = RISK_COLORS[level] ?? "gray";
  const label = RISK_LABELS[level] ?? level;
  const sym = level === "critical" ? SYM.cross : level === "high" ? SYM.warn : level === "medium" ? SYM.dot : SYM.check;
  return /* @__PURE__ */ jsxs11(Text11, { color, bold: true, children: [
    sym,
    " ",
    label
  ] });
}

// src/tui/classify-runner.js
import { readFileSync as readFileSync5, writeFileSync as writeFileSync8, mkdirSync as mkdirSync9 } from "fs";
import { resolve as resolve12, join as join8, basename } from "path";

// src/classifier/classifier.js
import { OpenAI } from "openai";
import { createReadStream, writeFileSync as writeFileSync6, unlinkSync as unlinkSync2 } from "fs";
import { resolve as resolve11 } from "path";
var CATEGORIES = [
  "religion",
  "politics",
  "race_discrimination",
  "fandom_conflict",
  "creative_risk",
  "community_conflict",
  "crime",
  "r18"
];
var SYSTEM_PROMPT = `You are a multilingual content risk classifier for social media posts by or about influencers in Japanese, Korean, and English.

Context awareness \u2014 apply before scoring:
- Academic citations, news quotes, and clearly labeled fiction do NOT count toward risk scores.
- Sarcastic criticism OF hate speech is not hate speech itself.
- Creator expressions of personal exhaustion or sadness \u2260 self-harm incitement.
- Score based on likely real-world impact, not surface vocabulary alone.

Score each dimension 0\u20133:
  0 = none  1 = mild  2 = moderate  3 = severe

Dimensions:
  religion           \u2013 religious extremism, blasphemy, sect incitement
  politics           \u2013 political propaganda, regime attacks, voter manipulation
  race_discrimination \u2013 racial slurs, ethnic hate, xenophobia, nationality attacks
  fandom_conflict    \u2013 idol/anime/game fan wars, defamation, coordinated attacks on creators; Korean-specific: \uC74C\uC6D0 \uC0AC\uC7AC\uAE30 accusations, \uC0AC\uC0DD\uD32C content, \uD0C8\uB355 combined with attacks
  creative_risk      \u2013 R18 doujin/fan-fiction terms, creator harassment, toxic ship wars
  community_conflict \u2013 passive-aggression, subtle mockery, community infighting; Japanese-specific: \u300C\u6C11\u5EA6\u300D\u300C\u5BDF\u3057\u3066\u300D\u300C\u304A\u5BDF\u3057\u300Dtrailing criticism \u300C\u2026\u307E\u3042\u3044\u3044\u3084\u300Dsarcastic \u300C(\u7B11)\u300D\u300C\uFF57\u300D\u300C\u8349\u300Dafter negative statements
  crime              \u2013 threats, doxxing, self-harm incitement (3=direct incitement / 2=explicit ideation / 1=vague distress), undisclosed paid promotion (\u30B9\u30C6\u30DE/\uB4B7\uAD11\uACE0), scam referrals
  r18                \u2013 explicit sexual content

If images are attached, analyze them as well \u2014 hate symbols, explicit content, political propaganda count toward relevant dimensions.

Return ONLY valid JSON. For every non-zero score include a brief English phrase (\u226410 words) in "reasons":
{"scores":{"religion":0,"politics":0,"race_discrimination":0,"fandom_conflict":0,"creative_risk":0,"community_conflict":0,"crime":0,"r18":0},"reasons":{}}

Examples:
Post: "\u3042\u306E\u4EBA\u306E\u6B4C\u58F0\u3001\u72EC\u7279\u3060\u3088\u306D\uFF08\u7B11\uFF09\u3082\u3063\u3068\u9811\u5F35\u308C\u3070\uFF1F"
{"scores":{"religion":0,"politics":0,"race_discrimination":0,"fandom_conflict":2,"creative_risk":0,"community_conflict":1,"crime":0,"r18":0},"reasons":{"fandom_conflict":"Sarcastic dismissal of creator's singing ability","community_conflict":"Backhanded encouragement with \uFF08\u7B11\uFF09 mockery"}}

Post: "\uADF8 \uD32C\uB364\uC740 \uD56D\uC0C1 \uC800\uB798. \uC9C4\uC9DC \uBBFC\uD3D0\uC784\u314B\u314B \uD0C8\uB355\uAC01"
{"scores":{"religion":0,"politics":0,"race_discrimination":0,"fandom_conflict":3,"creative_risk":0,"community_conflict":2,"crime":0,"r18":0},"reasons":{"fandom_conflict":"Broad attack labeling entire fandom as nuisance","community_conflict":"Dismissive mocking tone implying mass exit"}}

Post: "\u3042\u306ESS\u306F\u5B8C\u5168\u306BNL\u63A8\u3057\u3078\u306E\u5F53\u3066\u99AC\u3060\u308D\u3001\u4F5C\u8005\u306B\u6297\u8B70\u3057\u3088\u3046"
{"scores":{"religion":0,"politics":0,"race_discrimination":0,"fandom_conflict":1,"creative_risk":2,"community_conflict":1,"crime":0,"r18":0},"reasons":{"creative_risk":"Calling for organized protest against creator","fandom_conflict":"Bias accusation targeting shipping preference","community_conflict":"Mobilizing others against creator"}}`;
function cleanText(text) {
  return text.replace(/https?:\/\/\S+/g, "").replace(/\s{2,}/g, " ").trim();
}
function extractText(item) {
  const limit = item.platform === "youtube" ? 2e3 : 1500;
  return cleanText(item.text ?? "").slice(0, limit);
}
function extractImageUrls(item, maxImages = 2) {
  return (item.media ?? []).map((m) => m.url).filter(Boolean).slice(0, maxImages);
}
function buildUserContent(item) {
  const text = extractText(item);
  const imageUrls = extractImageUrls(item);
  if (!imageUrls.length) {
    return `Post: ${text}`;
  }
  const parts = [{ type: "text", text: `Post: ${text}` }];
  for (const url of imageUrls) {
    parts.push({ type: "image_url", image_url: { url, detail: "low" } });
  }
  return parts;
}
function buildBatchJSONL(posts, model = "gpt-4o-mini") {
  const lines = [];
  const seenTexts = /* @__PURE__ */ new Set();
  for (const post of posts) {
    const text = extractText(post);
    if (!text.trim() && !post.media?.length) continue;
    const dedupKey = text.slice(0, 80);
    if (dedupKey.length > 10 && !post.media?.length) {
      if (seenTexts.has(dedupKey)) continue;
      seenTexts.add(dedupKey);
    }
    const content = buildUserContent(post);
    lines.push(JSON.stringify({
      custom_id: String(post.id),
      method: "POST",
      url: "/v1/chat/completions",
      body: {
        model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content }
        ],
        response_format: { type: "json_object" },
        max_tokens: 300,
        temperature: 0
      }
    }));
  }
  return lines.join("\n");
}
function parseResult(content) {
  try {
    const obj = JSON.parse(content);
    const rawScores = obj.scores ?? obj;
    const scores = Object.fromEntries(
      CATEGORIES.map((c) => [c, Math.min(3, Math.max(0, Number(rawScores[c] ?? 0)))])
    );
    const reasons = obj.reasons && typeof obj.reasons === "object" ? obj.reasons : {};
    return { scores, reasons, source: "llm" };
  } catch {
    return { scores: Object.fromEntries(CATEGORIES.map((c) => [c, 0])), reasons: {}, source: "llm" };
  }
}
function parseOutputJSONL(text) {
  const results = {};
  for (const line of text.split("\n").filter(Boolean)) {
    try {
      const obj = JSON.parse(line);
      const content = obj.response?.body?.choices?.[0]?.message?.content ?? "{}";
      results[obj.custom_id] = parseResult(content);
    } catch {
    }
  }
  return results;
}
async function submitBatch(posts, opts = {}) {
  const {
    apiKey = process.env.OPENAI_API_KEY,
    model = "gpt-4o-mini",
    debug = false
  } = opts;
  if (!apiKey) throw new Error("OPENAI_API_KEY required. Set env var or use --api-key.");
  const client = new OpenAI({ apiKey });
  const dbg = (...m) => debug && console.log("[DBG]", ...m);
  const jsonl = buildBatchJSONL(posts, model);
  const count = jsonl.split("\n").filter(Boolean).length;
  console.log(`  Preparing ${count} items for Batch API (model: ${model})...`);
  const tmpPath = resolve11(`.tmp-classify-${Date.now()}.jsonl`);
  writeFileSync6(tmpPath, jsonl, "utf-8");
  try {
    const file = await client.files.create({
      file: createReadStream(tmpPath),
      purpose: "batch"
    });
    dbg(`File uploaded: ${file.id}`);
    const batch = await client.batches.create({
      input_file_id: file.id,
      endpoint: "/v1/chat/completions",
      completion_window: "24h"
    });
    console.log(`  Batch submitted: ${batch.id}`);
    console.log(`  Retrieve later: node classify.js --batch-id ${batch.id} --input <file> --out <dir>`);
    console.log(`  (Rule-engine pre-filtered ${posts.length - count} posts; only ${count} sent to LLM)`);
    return { batchId: batch.id, count };
  } finally {
    unlinkSync2(tmpPath);
  }
}
async function fetchBatchResults(batchId, opts = {}) {
  const {
    apiKey = process.env.OPENAI_API_KEY,
    wait = false,
    debug = false
  } = opts;
  const client = new OpenAI({ apiKey });
  const dbg = (...m) => debug && console.log("[DBG]", ...m);
  while (true) {
    const batch = await client.batches.retrieve(batchId);
    const { completed = 0, total = 0 } = batch.request_counts ?? {};
    dbg(`Batch ${batchId}: ${batch.status} (${completed}/${total})`);
    if (batch.status === "completed") {
      const raw = await client.files.content(batch.output_file_id);
      return { status: "completed", results: parseOutputJSONL(await raw.text()) };
    }
    if (["failed", "expired", "cancelled"].includes(batch.status)) {
      throw new Error(`Batch ${batchId} ended with status: ${batch.status}`);
    }
    if (!wait) return { status: batch.status, progress: `${completed}/${total}` };
    process.stdout.write(`\r  Waiting: ${batch.status} (${completed}/${total})...`);
    await new Promise((r) => setTimeout(r, 3e4));
  }
}
function aggregateUserRisk(posts, results) {
  const users = /* @__PURE__ */ new Map();
  for (const post of posts) {
    const result = results[String(post.id)];
    if (!result) continue;
    const { scores: score, reasons = {}, source = "llm" } = result;
    const authorId = String(post.author?.id ?? post.author?.username ?? "unknown");
    const username = post.author?.username ?? post.author?.handle ?? authorId;
    if (!users.has(authorId)) {
      users.set(authorId, {
        author_id: authorId,
        username,
        post_count: 0,
        category_sums: Object.fromEntries(CATEGORIES.map((c) => [c, 0])),
        flagged: [],
        severe_count: 0
      });
    }
    const u = users.get(authorId);
    u.post_count++;
    for (const c of CATEGORIES) u.category_sums[c] += score[c];
    const maxScore = Math.max(...Object.values(score));
    if (maxScore >= 2) {
      u.flagged.push({
        id: post.id,
        url: post.url ?? "",
        created_at: post.created_at ?? "",
        type: post.type ?? "tweet",
        rt_from: post.rt_from ?? null,
        // { tweet_id, username } for retweets
        text: extractText(post).slice(0, 300),
        score,
        reasons,
        source
      });
    }
    if (maxScore === 3) u.severe_count++;
  }
  return Array.from(users.values()).map((u) => {
    const n = u.post_count || 1;
    const catAvgs = Object.fromEntries(CATEGORIES.map((c) => [c, u.category_sums[c] / n]));
    const maxCat = Math.max(...Object.values(catAvgs));
    const overall = Object.values(catAvgs).reduce((s, v) => s + v, 0) / CATEGORIES.length;
    const base = (maxCat * 0.6 + overall * 0.4) / 3 * 100;
    const severityBonus = Math.min(20, u.severe_count * 3);
    const flagBonus = Math.min(10, u.flagged.length / n * 30);
    const riskScore = Math.min(100, Math.round(base + severityBonus + flagBonus));
    const riskLevel = riskScore >= 75 ? "critical" : riskScore >= 50 ? "high" : riskScore >= 25 ? "medium" : "low";
    const topCategories = CATEGORIES.map((c) => ({ c, v: u.category_sums[c] })).filter((x) => x.v > 0).sort((a, b) => b.v - a.v).slice(0, 3).map((x) => x.c);
    return {
      author_id: u.author_id,
      username: u.username,
      post_count: u.post_count,
      flagged_post_count: u.flagged.length,
      severe_post_count: u.severe_count,
      risk_score: riskScore,
      risk_level: riskLevel,
      top_categories: topCategories,
      category_averages: Object.fromEntries(
        CATEGORIES.map((c) => [c, Math.round(catAvgs[c] * 100) / 100])
      ),
      flagged_posts: u.flagged.slice(0, 10)
    };
  }).sort((a, b) => b.risk_score - a.risk_score);
}

// src/classifier/rules.js
var RULE_SET = {
  crime: [
    // ── Death threats ──────────────────────────────────────────────
    {
      pattern: /(?:殺す|殺してやる|ぶっ殺す|殺すぞ|殺すからな)/,
      score: 3,
      reason: "Direct death threat (Japanese)"
    },
    // 死ね: exclude quoted/reflected uses ("said die to me", "feel like dying")
    {
      pattern: /死ね(?!と言|って言|と感|と思|まし|ませ)/,
      score: 3,
      reason: "Death directive not in quoted context (Japanese)"
    },
    {
      pattern: /(?:죽여버릴|죽여버리겠|죽여줄게|죽여버려|죽이겠다)/,
      score: 3,
      reason: "Direct death threat (Korean)"
    },
    {
      pattern: /\bi(?:'ll| will| am going to) (?:kill|murder|hurt|destroy) (?:you|them|him|her|all of you)\b/i,
      score: 3,
      reason: "Direct death/harm threat (English)"
    },
    // ── Doxxing ───────────────────────────────────────────────────
    {
      pattern: /(?:住所|電話番号|個人情報|本名|実名).*(?:晒す|晒した|晒し|公開する|公開した|拡散)/,
      score: 3,
      reason: "Doxxing: personal info exposure (Japanese)"
    },
    {
      pattern: /(?:신상|개인정보|주소|전화번호|본명).*(?:털었|털어|공개|유포|올렸)/,
      score: 3,
      reason: "Doxxing: personal info exposure (Korean)"
    },
    {
      pattern: /\bi know where you (?:live|sleep|work)\b/i,
      score: 3,
      reason: "Doxxing threat (English)"
    },
    {
      pattern: /\bposting (?:your|their|his|her) (?:address|dox|personal info)\b/i,
      score: 3,
      reason: "Doxxing action (English)"
    },
    // ── Self-harm (score 2 — LLM still runs for context) ─────────
    {
      pattern: /(?:自殺|自傷|リスカ|首吊り|飛び降り).*(?:しよう|します|した|する気)/,
      score: 2,
      reason: "Self-harm intent expression (Japanese)"
    },
    {
      pattern: /(?:자살할|자해할|죽고싶다|사라지고싶다|없어지고싶다)/,
      score: 2,
      reason: "Self-harm ideation (Korean)"
    },
    {
      pattern: /\b(?:want to (?:kill|hurt) myself|going to (?:end it all|commit suicide))\b/i,
      score: 2,
      reason: "Self-harm ideation (English)"
    }
  ],
  r18: [
    // ── Explicit (score 3) ────────────────────────────────────────
    {
      pattern: /(?:無修正|生ハメ|中出し|フェラチオ|クンニリングス|輪姦|レイプ動画|ハメ撮り)/,
      score: 3,
      reason: "Explicit sexual content (Japanese)"
    },
    {
      pattern: /(?:포르노|야동|야설|강간영상|성인영상|자위영상|야한영상)/,
      score: 3,
      reason: "Explicit sexual content (Korean)"
    },
    {
      pattern: /\b(?:porn(?:ography)?|sex tape|rape video|masturbat(?:ion|ing)|cumshot|creampie)\b/i,
      score: 3,
      reason: "Explicit sexual content (English)"
    },
    // ── Adult labels / mild (score 2 — LLM adds context) ─────────
    {
      pattern: /\b(?:porn|hentai|xxx)\b/i,
      score: 2,
      reason: "Adult content keyword (English)"
    },
    {
      pattern: /(?:R-?18|18禁|成人指定|アダルト作品)/,
      score: 2,
      reason: "Adult content label detected"
    },
    {
      pattern: /(?:성인물|성인컨텐츠|야한)/,
      score: 2,
      reason: "Adult content label (Korean)"
    }
  ],
  race_discrimination: [
    // ── Slurs (score 3) ───────────────────────────────────────────
    {
      pattern: /(?:チョン|チョンコ|シナ人|ジャップ|外国人.*出て行け|黒人.*劣)/,
      score: 3,
      reason: "Racial slur or ethnic hate (Japanese)"
    },
    {
      pattern: /(?:쪽바리|짱깨|양키새끼)/,
      score: 3,
      reason: "Racial slur (Korean)"
    },
    {
      pattern: /\b(?:nigg[ae]r|ch[i*]nk|sp[i*]c|g[o*]ok|k[i*]ke|wetback|sand ?nigger)\b/i,
      score: 3,
      reason: "Racial slur (English)"
    }
  ],
  politics: [
    // ── Violent incitement (score 3) ──────────────────────────────
    {
      pattern: /(?:今すぐ革命|政府を打倒|クーデター|政権転覆|武装蜂起)/,
      score: 3,
      reason: "Violent political incitement (Japanese)"
    },
    {
      pattern: /(?:혁명을 일으키자|정부를 타도|쿠데타|정권 전복|무장 봉기)/,
      score: 3,
      reason: "Violent political incitement (Korean)"
    },
    {
      pattern: /\b(?:overthrow the government|start the revolution now|take up arms against|armed uprising against)\b/i,
      score: 3,
      reason: "Violent political incitement (English)"
    }
  ],
  religion: [
    // ── Incitement against religious groups (score 3) ─────────────
    {
      pattern: /(?:(?:キリスト|イスラム|ユダヤ|仏教)(?:徒|教徒).*(?:殺せ|死ね|滅びろ|消えろ))/,
      score: 3,
      reason: "Religious hate/incitement (Japanese)"
    },
    {
      pattern: /\b(?:kill all (?:muslims|christians|jews|infidels)|(?:muslims|jews|christians) must die)\b/i,
      score: 3,
      reason: "Religious extremism / kill-group incitement (English)"
    }
  ]
};
var WHITELIST_PATTERNS = [
  /^[\s！!。.…~〜ー]*(?:ありがとう|おはよう|おやすみ|いただきます|お疲れ様|こんにちは|こんばんは)[\s！!。.…~〜]*$/u,
  /^[\s!.]*(?:감사합니다|안녕하세요|안녕히 주무세요|좋은 아침|감사해요|고마워)[\s!.]*$/u,
  /^[\s!.,]*(?:good (?:morning|night|evening|day)|thank(?:s| you)|congrats?(?:ulations)?|happy birthday|welcome back)[\s!.,]*$/iu
];
function applyRules(text) {
  if (!text || !text.trim()) return null;
  if (text.length <= 60) {
    for (const pat of WHITELIST_PATTERNS) {
      if (pat.test(text.trim())) {
        return {
          scores: Object.fromEntries(CATEGORIES.map((c) => [c, 0])),
          reasons: {},
          source: "whitelist"
        };
      }
    }
  }
  const scores = Object.fromEntries(CATEGORIES.map((c) => [c, 0]));
  const reasons = {};
  let hasScore3 = false;
  for (const [category, rules] of Object.entries(RULE_SET)) {
    let maxScore = 0;
    let topReason = null;
    for (const rule of rules) {
      if (rule.pattern.test(text) && rule.score > maxScore) {
        maxScore = rule.score;
        topReason = rule.reason;
      }
    }
    if (maxScore > 0) {
      scores[category] = maxScore;
      reasons[category] = topReason;
      if (maxScore === 3) hasScore3 = true;
    }
  }
  return hasScore3 ? { scores, reasons, source: "rules" } : null;
}
function applyRulesAll(posts) {
  const results = /* @__PURE__ */ new Map();
  for (const post of posts) {
    const text = (post.text ?? "").slice(0, 1500);
    const result = applyRules(text);
    if (result) results.set(String(post.id), result);
  }
  return results;
}

// src/classifier/output.js
function toClassifierJSON(userRisks, results) {
  return JSON.stringify({ user_risks: userRisks, post_results: results }, null, 2);
}
var USER_RISK_HEADERS = [
  "author_id",
  "username",
  "risk_level",
  "risk_score",
  "post_count",
  "flagged_post_count",
  "severe_post_count",
  "top_categories",
  ...CATEGORIES
];
function toUserRiskCSV(userRisks) {
  const esc = (v) => {
    const s = String(v ?? "");
    return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = userRisks.map((u) => [
    u.author_id,
    u.username,
    u.risk_level,
    u.risk_score,
    u.post_count,
    u.flagged_post_count,
    u.severe_post_count,
    u.top_categories.join(" "),
    ...CATEGORIES.map((c) => u.category_averages[c] ?? 0)
  ].map(esc).join(","));
  return [USER_RISK_HEADERS.join(","), ...rows].join("\n");
}
var FLAGGED_HEADERS = [
  "author_id",
  "username",
  "post_id",
  "url",
  "created_at",
  "type",
  "rt_from",
  "source",
  ...CATEGORIES,
  "text",
  "reasons"
];
function toFlaggedPostsCSV(userRisks) {
  const esc = (v) => {
    const s = String(v ?? "");
    return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = [];
  for (const u of userRisks) {
    for (const p of u.flagged_posts) {
      const reasonSummary = Object.entries(p.reasons ?? {}).map(([cat, r]) => `${cat}: ${r}`).join(" | ");
      const rtFrom = p.rt_from ? `@${p.rt_from.username ?? ""}/${p.rt_from.tweet_id ?? ""}` : "";
      rows.push([
        u.author_id,
        u.username,
        p.id,
        p.url,
        p.created_at,
        p.type ?? "tweet",
        rtFrom,
        p.source ?? "llm",
        ...CATEGORIES.map((c) => p.score[c] ?? 0),
        p.text ?? "",
        reasonSummary
      ].map(esc).join(","));
    }
  }
  return [FLAGGED_HEADERS.join(","), ...rows].join("\n");
}

// src/shared/normalize.js
var NORMALIZERS = {
  twitter(p) {
    return {
      ...p,
      author: {
        id: p.author?.id ?? null,
        username: p.author?.username ?? null,
        name: p.author?.name ?? null
      },
      media: (p.media ?? []).map((m) => ({
        type: m.type === "photo" ? "photo" : "video",
        url: m.url ?? m.preview ?? ""
      })).filter((m) => m.url),
      rt_from: p.rt_from ?? null,
      tags: [],
      is_r18: false
    };
  },
  tiktok(p) {
    return {
      ...p,
      text: p.description ?? p.text ?? "",
      author: {
        id: p.author?.id ?? null,
        username: p.author?.username ?? null,
        name: p.author?.nickname ?? p.author?.name ?? null
      },
      media: p.thumbnail ? [{ type: "photo", url: p.thumbnail }] : [],
      type: p.type ?? "video",
      rt_from: null,
      tags: p.hashtags ?? [],
      is_r18: false
    };
  },
  reddit(p) {
    return {
      ...p,
      text: [p.title, p.text].filter(Boolean).join("\n"),
      author: {
        id: null,
        username: p.author?.username ?? null,
        name: p.author?.username ?? null
      },
      media: [],
      type: p.type ?? "post",
      rt_from: null,
      tags: [],
      is_r18: p.is_nsfw ?? false
    };
  },
  threads(p) {
    return {
      ...p,
      author: {
        id: null,
        username: p.author?.username ?? null,
        name: p.author?.name ?? null
      },
      media: (p.media ?? []).map((m) => ({ type: m.type, url: m.url })),
      rt_from: null,
      tags: [],
      is_r18: false
    };
  },
  pixiv(p) {
    return {
      ...p,
      text: [p.title, p.caption, (p.tags ?? []).join(" ")].filter(Boolean).join("\n"),
      author: {
        id: p.author?.id ?? null,
        username: p.author?.account ?? p.author?.name ?? null,
        name: p.author?.name ?? null
      },
      // Pixiv full-res images require auth; use empty media for classification
      media: [],
      rt_from: null,
      tags: p.tags ?? [],
      is_r18: p.is_r18 ?? false
    };
  },
  naver_cafe(p) {
    return {
      ...p,
      text: [p.title, p.text].filter(Boolean).join("\n"),
      author: {
        id: p.author?.id ?? null,
        username: p.author?.nickname ?? null,
        name: p.author?.nickname ?? null
      },
      media: [],
      rt_from: null,
      tags: [],
      is_r18: false
    };
  },
  youtube(p) {
    return {
      ...p,
      text: [p.title, p.description, p.transcript].filter(Boolean).join("\n"),
      author: {
        id: p.author?.id ?? null,
        username: p.author?.username ?? null,
        name: p.author?.username ?? null
      },
      media: p.thumbnail ? [{ type: "photo", url: p.thumbnail }] : [],
      type: "video",
      rt_from: null,
      tags: p.tags ?? [],
      is_r18: false
    };
  }
};
function normalizePost(post) {
  const fn = NORMALIZERS[post?.platform];
  return fn ? fn(post) : post;
}
function extractPosts(data) {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== "object") return [];
  if (Array.isArray(data.tweets)) return data.tweets;
  if (Array.isArray(data.videos)) return data.videos;
  if (Array.isArray(data.posts)) return data.posts;
  if (Array.isArray(data.artworks)) return data.artworks;
  if (Array.isArray(data.items)) return data.items;
  return [];
}
function normalizePosts(data, { includeComments = false } = {}) {
  const posts = extractPosts(data).map(normalizePost);
  if (!includeComments) return posts;
  const items = [];
  for (const post of posts) {
    items.push(post);
    for (const c of post.comments ?? []) {
      items.push(normalizePost({
        id: `${post.id}__cmt__${c.id}`,
        platform: post.platform,
        url: post.url,
        text: c.text ?? "",
        author: c.author,
        created_at: c.created_at,
        type: "comment",
        _is_comment: true,
        _parent_id: post.id
      }));
    }
  }
  return items;
}
function mergeAndNormalize(dataArray, opts = {}) {
  return dataArray.flatMap((d) => normalizePosts(d, opts));
}

// src/shared/batch-store.js
import { homedir as homedir3 } from "os";
import { join as join7 } from "path";
import { readFileSync as readFileSync4, writeFileSync as writeFileSync7, mkdirSync as mkdirSync8, existsSync as existsSync9 } from "fs";
var STORE_DIR = join7(homedir3(), ".sns-audit");
var STORE_FILE = join7(STORE_DIR, "batches.json");
function load2() {
  try {
    if (!existsSync9(STORE_FILE)) return [];
    return JSON.parse(readFileSync4(STORE_FILE, "utf-8"));
  } catch {
    return [];
  }
}
function persist(records) {
  mkdirSync8(STORE_DIR, { recursive: true });
  writeFileSync7(STORE_FILE, JSON.stringify(records, null, 2), "utf-8");
}
function saveBatch(record) {
  const records = load2();
  records.push({
    status: "pending",
    created_at: (/* @__PURE__ */ new Date()).toISOString(),
    ...record
  });
  persist(records);
}
function updateBatch(batchId, updates) {
  const records = load2();
  const idx = records.findLastIndex((r) => r.id === batchId);
  if (idx >= 0) records[idx] = { ...records[idx], ...updates };
  persist(records);
}
function listBatches() {
  return load2().slice().reverse();
}

// src/tui/classify-runner.js
function sessionStamp2() {
  const d = /* @__PURE__ */ new Date();
  const date = d.toISOString().slice(0, 10);
  const time = d.toTimeString().slice(0, 8).replace(/:/g, "");
  return `${date}_${time}`;
}
async function runClassify(config, onLog = () => {
}) {
  const {
    inputFiles = [],
    batchId: existingBatchId,
    model = "gpt-4.1-mini",
    outDir = "./out/",
    wait = true,
    apiKey = process.env.OPENAI_API_KEY
  } = config;
  if (!apiKey) throw new Error("OPENAI_API_KEY \u672A\u8BBE\u7F6E\u3002\u8BF7\u8BBE\u7F6E\u73AF\u5883\u53D8\u91CF $env:OPENAI_API_KEY\u3002");
  const classifiedDir = join8(resolve12(outDir), "classified");
  mkdirSync9(classifiedDir, { recursive: true });
  let allPosts = [];
  if (inputFiles.length) {
    const dataArray = inputFiles.map((f) => {
      try {
        return JSON.parse(readFileSync5(f, "utf-8"));
      } catch {
        onLog(`[WARN] \u65E0\u6CD5\u8BFB\u53D6\u6587\u4EF6: ${basename(f)}`);
        return null;
      }
    }).filter(Boolean);
    allPosts = mergeAndNormalize(dataArray);
    onLog(`\u5171\u52A0\u8F7D ${allPosts.length} \u6761\u5185\u5BB9\uFF08${inputFiles.length} \u4E2A\u6587\u4EF6\uFF09`);
  }
  let ruleResults = {};
  let llmPosts = allPosts;
  if (allPosts.length) {
    const ruleHits = applyRulesAll(allPosts);
    ruleResults = Object.fromEntries(
      ruleHits.map((r) => [String(r.id), { scores: r.scores, reasons: r.reasons ?? {}, source: "rule" }])
    );
    llmPosts = allPosts.filter((p) => !ruleResults[String(p.id)]);
    onLog(`\u89C4\u5219\u5F15\u64CE\u547D\u4E2D ${Object.keys(ruleResults).length} \u6761\uFF0C\u5269\u4F59 ${llmPosts.length} \u6761\u53D1\u9001 LLM`);
  }
  let resolvedBatchId = existingBatchId;
  let llmResults = {};
  let finalStatus;
  if (resolvedBatchId) {
    onLog(`\u6B63\u5728\u68C0\u7D22\u6279\u6B21 ${resolvedBatchId}...`);
    const res = await fetchBatchResults(resolvedBatchId, { apiKey, wait, debug: false });
    finalStatus = res.status;
    if (res.status === "completed") {
      llmResults = res.results;
      updateBatch(resolvedBatchId, { status: "completed", completed_at: (/* @__PURE__ */ new Date()).toISOString() });
      onLog(`\u6279\u6B21\u5DF2\u5B8C\u6210\uFF0C\u5171 ${Object.keys(llmResults).length} \u6761\u7ED3\u679C`);
    } else {
      onLog(`\u6279\u6B21\u5C1A\u672A\u5B8C\u6210\uFF08${res.status}\uFF09\uFF1A${res.progress ?? ""}`);
      return { batchId: resolvedBatchId, status: res.status, postCount: allPosts.length };
    }
  } else if (llmPosts.length) {
    onLog(`\u6B63\u5728\u63D0\u4EA4\u6279\u6B21\uFF08${llmPosts.length} \u6761\uFF0C\u6A21\u578B ${model}\uFF09...`);
    const { batchId: newId } = await submitBatch(llmPosts, { apiKey, model, debug: false });
    resolvedBatchId = newId;
    onLog(`\u6279\u6B21\u5DF2\u63D0\u4EA4\uFF1A${newId}`);
    saveBatch({
      id: newId,
      model,
      post_count: llmPosts.length,
      input_files: inputFiles,
      out: classifiedDir
    });
    if (!wait) {
      return { batchId: newId, status: "submitted", postCount: llmPosts.length };
    }
    onLog("\u7B49\u5F85\u6279\u6B21\u5B8C\u6210\uFF08\u6700\u957F 24 \u5C0F\u65F6\uFF0C\u6BCF 30 \u79D2\u8F6E\u8BE2\u4E00\u6B21\uFF09...");
    const res = await fetchBatchResults(newId, { apiKey, wait: true, debug: false });
    if (res.status !== "completed") {
      return { batchId: newId, status: res.status, postCount: llmPosts.length };
    }
    llmResults = res.results;
    finalStatus = "completed";
    updateBatch(newId, { status: "completed", completed_at: (/* @__PURE__ */ new Date()).toISOString() });
    onLog(`\u6279\u6B21\u5B8C\u6210\uFF0C\u5171 ${Object.keys(llmResults).length} \u6761\u7ED3\u679C`);
  } else {
    onLog("\u6240\u6709\u5185\u5BB9\u5DF2\u7531\u89C4\u5219\u5F15\u64CE\u5904\u7406\uFF0C\u65E0\u9700 LLM \u6279\u6B21\u3002");
    finalStatus = "completed";
    resolvedBatchId = resolvedBatchId ?? null;
  }
  if (!allPosts.length) {
    if (existingBatchId) {
      throw new Error("\u6279\u6B21\u5DF2\u5B8C\u6210\uFF0C\u4F46\u539F\u59CB\u8F93\u5165\u6587\u4EF6\u4E22\u5931\uFF0C\u65E0\u6CD5\u751F\u6210\u8F93\u51FA\u62A5\u544A\u3002\n\u8BF7\u5728 ClassifySetup \u4E2D\u91CD\u65B0\u6307\u5B9A\u539F\u59CB\u6587\u4EF6\u5E76\u642D\u914D --batch-id \u68C0\u7D22\u3002");
    }
    return { batchId: resolvedBatchId, status: finalStatus, postCount: 0 };
  }
  const allResults = { ...ruleResults, ...llmResults };
  const userRisk = aggregateUserRisk(allPosts, allResults);
  const stamp = sessionStamp2();
  const base = join8(classifiedDir, stamp);
  const savedFiles = [];
  const jsonPath = `${base}.json`;
  writeFileSync8(jsonPath, toClassifierJSON(userRisk, allPosts, allResults));
  savedFiles.push({ file: jsonPath, label: "\u7EFC\u5408\u62A5\u544A (JSON)" });
  const csvPath = `${base}_user_risk.csv`;
  writeFileSync8(csvPath, toUserRiskCSV(userRisk));
  savedFiles.push({ file: csvPath, label: "\u7528\u6237\u98CE\u9669 (CSV)" });
  const flagPath = `${base}_flagged.csv`;
  writeFileSync8(flagPath, toFlaggedPostsCSV(userRisk));
  savedFiles.push({ file: flagPath, label: "\u6807\u8BB0\u5185\u5BB9 (CSV)" });
  onLog(`\u8F93\u51FA\u5DF2\u5199\u5165 ${classifiedDir}`);
  return {
    batchId: resolvedBatchId ?? null,
    status: "completed",
    postCount: allPosts.length,
    userRisk,
    savedFiles
  };
}

// src/tui/screens/ClassifyRun.js
import { jsx as jsx11, jsxs as jsxs12 } from "react/jsx-runtime";
function fmtElapsed2(secs) {
  const m = Math.floor(secs / 60).toString().padStart(2, "0");
  const s = (secs % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}
function logColor2(line) {
  if (line.startsWith("[ERR]")) return "red";
  if (line.startsWith("[WARN]")) return "yellow";
  return "gray";
}
function LogLine2({ text }) {
  const color = logColor2(text);
  const prefix = text.startsWith("[ERR]") ? `${SYM.cross} ` : text.startsWith("[WARN]") ? `${SYM.warn}  ` : "  ";
  const body = text.replace(/^\[(ERR|WARN)\] /, "");
  return /* @__PURE__ */ jsxs12(Box11, { gap: 0, children: [
    /* @__PURE__ */ jsx11(Text12, { color, children: prefix }),
    /* @__PURE__ */ jsx11(Text12, { color, dimColor: true, wrap: "truncate", children: body })
  ] });
}
function useElapsed2(active) {
  const [secs, setSecs] = useState8(0);
  useEffect3(() => {
    if (!active) return;
    const id = setInterval(() => setSecs((s) => s + 1), 1e3);
    return () => clearInterval(id);
  }, [active]);
  return secs;
}
var RECENT_LINES2 = 5;
function ClassifyRun({ config, onNav }) {
  const [recentLogs, setRecentLogs] = useState8([]);
  const [status, setStatus] = useState8("running");
  const [result, setResult] = useState8(null);
  const [errorMsg, setError] = useState8("");
  const rawRef = useRef2([]);
  const committed = useRef2(0);
  const elapsed = useElapsed2(status === "running");
  useInput8((_, key) => {
    if (key.escape && status !== "running") onNav("menu");
  });
  useEffect3(() => {
    let cancelled = false;
    const orig = {
      log: console.log.bind(console),
      error: console.error.bind(console),
      warn: console.warn.bind(console)
    };
    const push = (...args) => {
      const line = args.map((a) => typeof a === "string" ? a : JSON.stringify(a)).join(" ");
      rawRef.current.push(line);
    };
    console.log = push;
    console.error = (...a) => push("[ERR] " + a.join(" "));
    console.warn = (...a) => push("[WARN] " + a.join(" "));
    const onLog = (msg) => {
      rawRef.current.push(msg);
    };
    const flush = () => {
      if (cancelled) return;
      const all = rawRef.current;
      if (all.length <= committed.current) return;
      committed.current = all.length;
      setRecentLogs(all.slice(-RECENT_LINES2));
    };
    const timer = setInterval(flush, 500);
    runClassify(config, onLog).then((res) => {
      if (!cancelled) {
        setResult(res);
        setStatus(res.status === "submitted" ? "submitted" : "done");
      }
    }).catch((err) => {
      if (!cancelled) {
        setError(err.message ?? String(err));
        setStatus("error");
      }
    }).finally(() => {
      clearInterval(timer);
      flush();
      Object.assign(console, orig);
    });
    return () => {
      cancelled = true;
      clearInterval(timer);
      Object.assign(console, orig);
    };
  }, []);
  const topUsers = result?.userRisk?.slice(0, 5) ?? [];
  const statusColor = status === "error" ? "red" : status === "done" ? "green" : status === "submitted" ? "yellow" : "cyan";
  return /* @__PURE__ */ jsxs12(Box11, { flexDirection: "column", paddingX: 2, paddingY: 1, gap: 1, children: [
    /* @__PURE__ */ jsxs12(
      Box11,
      {
        flexDirection: "column",
        borderStyle: "round",
        borderColor: statusColor,
        paddingX: 2,
        paddingY: 0,
        children: [
          /* @__PURE__ */ jsxs12(Box11, { gap: 2, children: [
            /* @__PURE__ */ jsx11(Text12, { bold: true, color: statusColor, children: status === "running" ? `${SYM.run} AI \u5206\u7C7B\u8FD0\u884C\u4E2D` : status === "done" ? `${SYM.check} \u5206\u7C7B\u5B8C\u6210` : status === "submitted" ? `${SYM.dot} \u6279\u6B21\u5DF2\u63D0\u4EA4` : `${SYM.cross} \u51FA\u9519` }),
            status === "running" && /* @__PURE__ */ jsx11(Text12, { color: "gray", dimColor: true, children: fmtElapsed2(elapsed) })
          ] }),
          status === "running" && (recentLogs.length === 0 ? /* @__PURE__ */ jsx11(Text12, { color: "gray", dimColor: true, children: "  \u6B63\u5728\u542F\u52A8..." }) : recentLogs.map((line, i) => /* @__PURE__ */ jsx11(LogLine2, { text: line }, i))),
          status === "error" && /* @__PURE__ */ jsxs12(Text12, { color: "red", wrap: "truncate", children: [
            "  ",
            errorMsg
          ] })
        ]
      }
    ),
    status === "submitted" && result && /* @__PURE__ */ jsxs12(Box11, { flexDirection: "column", borderStyle: "round", borderColor: "yellow", paddingX: 2, children: [
      /* @__PURE__ */ jsxs12(Text12, { color: "yellow", bold: true, children: [
        SYM.dot,
        " \u6279\u6B21\u5DF2\u63D0\u4EA4",
        result.batchId ? ` \u2014 ${result.batchId}` : ""
      ] }),
      /* @__PURE__ */ jsx11(Text12, { color: "gray", dimColor: true, children: '\u7ED3\u679C\u901A\u5E38\u5728 1\u201324 \u5C0F\u65F6\u5185\u5C31\u7EEA\uFF0C\u8BF7\u5728"\u67E5\u770B\u5206\u7C7B\u4EFB\u52A1"\u4E2D\u68C0\u7D22\u3002' })
    ] }),
    status === "done" && result && /* @__PURE__ */ jsxs12(Box11, { flexDirection: "column", borderStyle: "round", borderColor: "green", paddingX: 2, paddingY: 0, gap: 1, children: [
      /* @__PURE__ */ jsxs12(Text12, { bold: true, color: "green", children: [
        SYM.check,
        " \u5B8C\u6210  \u5171 ",
        result.postCount,
        " \u6761\u5185\u5BB9"
      ] }),
      topUsers.length > 0 && /* @__PURE__ */ jsxs12(Box11, { flexDirection: "column", children: [
        /* @__PURE__ */ jsxs12(Text12, { color: "gray", dimColor: true, children: [
          "\u98CE\u9669\u6700\u9AD8\u7528\u6237\uFF08\u524D ",
          topUsers.length,
          "\uFF09"
        ] }),
        topUsers.map((u) => /* @__PURE__ */ jsxs12(Box11, { gap: 3, children: [
          /* @__PURE__ */ jsx11(RiskBadge, { level: u.risk_level }),
          /* @__PURE__ */ jsxs12(Text12, { children: [
            "@",
            u.username
          ] }),
          /* @__PURE__ */ jsxs12(Text12, { color: "gray", dimColor: true, children: [
            u.risk_score,
            " \u5206 \xB7 ",
            u.flagged_post_count,
            " \u6761\u6807\u8BB0"
          ] })
        ] }, u.author_id))
      ] }),
      result.savedFiles?.length > 0 && /* @__PURE__ */ jsxs12(Box11, { flexDirection: "column", children: [
        /* @__PURE__ */ jsx11(Text12, { color: "gray", dimColor: true, children: "\u8F93\u51FA\u6587\u4EF6" }),
        result.savedFiles.map(({ file, label }) => /* @__PURE__ */ jsxs12(Box11, { gap: 2, children: [
          /* @__PURE__ */ jsx11(Text12, { color: "gray", dimColor: true, children: SYM.arrow }),
          /* @__PURE__ */ jsx11(Text12, { color: "cyan", children: label })
        ] }, file))
      ] })
    ] }),
    status !== "running" && /* @__PURE__ */ jsx11(KeyBar, { hints: [{ key: "ESC", label: "\u8FD4\u56DE\u4E3B\u83DC\u5355" }] })
  ] });
}

// src/tui/screens/JobsList.js
import React13, { useState as useState9 } from "react";
import { Box as Box12, Text as Text13, useInput as useInput9 } from "ink";
import SelectInput5 from "ink-select-input";
import { jsx as jsx12, jsxs as jsxs13 } from "react/jsx-runtime";
function fmtAge(iso) {
  const h = Math.round((Date.now() - new Date(iso)) / 36e5);
  if (h < 1) return "\u521A\u521A";
  if (h < 24) return `${h} \u5C0F\u65F6\u524D`;
  return `${Math.round(h / 24)} \u5929\u524D`;
}
function Indicator4({ isSelected }) {
  return /* @__PURE__ */ jsx12(Box12, { marginRight: 1, children: isSelected ? /* @__PURE__ */ jsx12(Text13, { color: "cyan", bold: true, children: SYM.cursor }) : /* @__PURE__ */ jsx12(Text13, { children: " " }) });
}
function Item4({ label, isSelected }) {
  return /* @__PURE__ */ jsx12(Text13, { color: isSelected ? "white" : "gray", children: label });
}
function JobsList({ onNav }) {
  const batches = listBatches();
  useInput9((_, key) => {
    if (key.escape) onNav("menu");
  });
  const pendingBatches = batches.filter((b) => b.status === "pending");
  if (!batches.length) {
    return /* @__PURE__ */ jsxs13(Box12, { flexDirection: "column", paddingX: 2, paddingY: 1, gap: 1, children: [
      /* @__PURE__ */ jsx12(Text13, { bold: true, color: "cyan", children: "\u5206\u7C7B\u4EFB\u52A1\u5217\u8868" }),
      /* @__PURE__ */ jsx12(
        Box12,
        {
          borderStyle: "round",
          borderColor: "gray",
          borderDimColor: true,
          paddingX: 2,
          paddingY: 1,
          children: /* @__PURE__ */ jsx12(Text13, { color: "gray", dimColor: true, children: "\u6682\u65E0\u5386\u53F2\u4EFB\u52A1\u3002\u5148\u91C7\u96C6\u5185\u5BB9\uFF0C\u518D\u63D0\u4EA4 AI \u5206\u7C7B\u3002" })
        }
      ),
      /* @__PURE__ */ jsx12(KeyBar, { hints: [{ key: "ESC", label: "\u8FD4\u56DE\u83DC\u5355" }] })
    ] });
  }
  const handleSelect = ({ value }) => {
    const batch = batches.find((b) => b.id === value);
    if (!batch || batch.status !== "pending") return;
    onNav("classify-run", {
      classifyConfig: {
        batchId: value,
        model: batch.model ?? "gpt-4.1-mini",
        inputFiles: batch.input_files ?? [],
        outDir: batch.out ?? "./out/",
        wait: false
        // retrieve only — never block on a 24h poll
      }
    });
  };
  return /* @__PURE__ */ jsxs13(Box12, { flexDirection: "column", paddingX: 2, paddingY: 1, gap: 1, children: [
    /* @__PURE__ */ jsx12(Text13, { bold: true, color: "cyan", children: "\u5206\u7C7B\u4EFB\u52A1\u5217\u8868" }),
    /* @__PURE__ */ jsxs13(
      Box12,
      {
        flexDirection: "column",
        borderStyle: "round",
        borderColor: "gray",
        borderDimColor: true,
        paddingX: 2,
        paddingY: 0,
        children: [
          /* @__PURE__ */ jsxs13(Box12, { gap: 3, marginBottom: 0, children: [
            /* @__PURE__ */ jsx12(Text13, { color: "gray", dimColor: true, children: "\u72B6\u6001".padEnd(6) }),
            /* @__PURE__ */ jsx12(Text13, { color: "gray", dimColor: true, children: "ID\uFF08\u540E 12 \u4F4D\uFF09".padEnd(14) }),
            /* @__PURE__ */ jsx12(Text13, { color: "gray", dimColor: true, children: "\u6570\u91CF".padEnd(6) }),
            /* @__PURE__ */ jsx12(Text13, { color: "gray", dimColor: true, children: "\u65F6\u95F4" })
          ] }),
          /* @__PURE__ */ jsx12(Box12, { children: /* @__PURE__ */ jsx12(Text13, { color: "gray", dimColor: true, children: "\u2500".repeat(48) }) }),
          batches.map((b) => /* @__PURE__ */ jsxs13(Box12, { gap: 3, children: [
            /* @__PURE__ */ jsx12(BatchBadge, { status: b.status }),
            /* @__PURE__ */ jsx12(Text13, { color: "gray", dimColor: true, children: b.id.slice(-12) }),
            /* @__PURE__ */ jsx12(Text13, { color: "gray", dimColor: true, children: String(b.post_count).padStart(5) }),
            /* @__PURE__ */ jsx12(Text13, { color: "gray", dimColor: true, children: fmtAge(b.created_at) })
          ] }, b.id))
        ]
      }
    ),
    pendingBatches.length > 0 ? /* @__PURE__ */ jsxs13(Box12, { flexDirection: "column", gap: 0, children: [
      /* @__PURE__ */ jsx12(Text13, { bold: true, color: "cyan", children: "\u68C0\u7D22\u7B49\u5F85\u4E2D\u7684\u6279\u6B21" }),
      /* @__PURE__ */ jsx12(
        SelectInput5,
        {
          items: pendingBatches.map((b) => ({
            label: `${b.id.slice(-12)}  ${b.post_count} \u6761  ${fmtAge(b.created_at)}`,
            value: b.id
          })),
          onSelect: handleSelect,
          indicatorComponent: Indicator4,
          itemComponent: Item4
        }
      )
    ] }) : /* @__PURE__ */ jsx12(
      Box12,
      {
        borderStyle: "round",
        borderColor: "gray",
        borderDimColor: true,
        paddingX: 2,
        children: /* @__PURE__ */ jsxs13(Text13, { color: "gray", dimColor: true, children: [
          SYM.check,
          " \u6CA1\u6709\u7B49\u5F85\u4E2D\u7684\u6279\u6B21\u3002\u6240\u6709\u4EFB\u52A1\u5DF2\u5B8C\u6210\u6216\u5931\u8D25\u3002"
        ] })
      }
    ),
    /* @__PURE__ */ jsx12(KeyBar, { hints: [{ key: "ESC", label: "\u8FD4\u56DE\u83DC\u5355" }] })
  ] });
}

// src/tui/screens/DataPreview.js
import React14, { useState as useState10, useMemo as useMemo3, useEffect as useEffect4 } from "react";
import { Box as Box13, Text as Text14, useInput as useInput10 } from "ink";
import SelectInput6 from "ink-select-input";
import { readdirSync as readdirSync3, readFileSync as readFileSync6, existsSync as existsSync10 } from "fs";
import { resolve as resolve13, join as join9, relative as relative2, basename as basename2 } from "path";
import { jsx as jsx13, jsxs as jsxs14 } from "react/jsx-runtime";
var PAGE_SIZE2 = 10;
function extractRecords(data) {
  if (Array.isArray(data)) return data;
  const arr = data.tweets ?? data.videos ?? data.posts ?? data.items ?? data.results ?? data.artworks;
  if (Array.isArray(arr)) return arr;
  return [data];
}
function flattenRecord(rec) {
  const flat = {};
  for (const [k, v] of Object.entries(rec)) {
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      for (const [k2, v2] of Object.entries(v)) {
        if (typeof v2 !== "object") flat[`${k}.${k2}`] = v2;
      }
    } else {
      flat[k] = v;
    }
  }
  return flat;
}
var FIELD_PRIORITY = [
  ["author.username", "username", "user", "screen_name", "name", "author.name"],
  ["text", "content", "body", "title", "full_text", "selftext"],
  ["created_at", "date", "time", "timestamp", "created", "publishedAt"],
  ["platform", "source", "type", "lang"],
  [
    "metrics.like_count",
    "likes",
    "retweet_count",
    "score",
    "hearts",
    "digg_count",
    "metrics.retweet_count",
    "metrics.reply_count"
  ]
];
function detectColumns(records) {
  if (!records.length) return [];
  const flat = flattenRecord(records[0]);
  const keys = Object.keys(flat);
  const cols = [];
  for (const group of FIELD_PRIORITY) {
    const found = group.find((g) => keys.find((k) => k.toLowerCase() === g.toLowerCase()));
    if (found) {
      const actual = keys.find((k) => k.toLowerCase() === found.toLowerCase());
      if (actual && !cols.includes(actual)) cols.push(actual);
    }
  }
  for (const k of keys) {
    if (cols.length >= 6) break;
    if (!cols.includes(k)) {
      const sample = flat[k];
      if (sample != null && typeof sample !== "object") cols.push(k);
    }
  }
  return cols;
}
function cellValue(rec, col) {
  const parts = col.split(".");
  let val = rec;
  for (const p of parts) {
    if (val == null || typeof val !== "object") {
      val = void 0;
      break;
    }
    val = val[p];
  }
  if (val == null) return "";
  if (typeof val === "object") return JSON.stringify(val).slice(0, 40);
  return String(val);
}
function truncate(str, max) {
  if (str.length <= max) return str;
  return str.slice(0, max - 1) + "\u2026";
}
function Indicator5({ isSelected }) {
  return /* @__PURE__ */ jsx13(Box13, { marginRight: 1, children: isSelected ? /* @__PURE__ */ jsx13(Text14, { color: "cyan", bold: true, children: SYM.cursor }) : /* @__PURE__ */ jsx13(Text14, { children: " " }) });
}
function Item5({ label, isSelected }) {
  return /* @__PURE__ */ jsx13(Text14, { color: isSelected ? "white" : "gray", children: label });
}
function scanJsonFilesRecursive2(dir) {
  const results = [];
  try {
    let walk = function(d) {
      let entries;
      try {
        entries = readdirSync3(d, { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of entries) {
        if (e.isDirectory()) {
          if (e.name !== "classified") walk(join9(d, e.name));
        } else if (e.name.endsWith(".json")) {
          const full = join9(d, e.name);
          results.push({ label: relative2(abs, full), value: full });
        }
      }
    };
    const abs = resolve13(dir);
    if (!existsSync10(abs)) return [];
    walk(abs);
  } catch {
  }
  return results.sort((a, b) => b.label.localeCompare(a.label));
}
function TableView({ records, filePath, onBack }) {
  const [rowIdx, setRowIdx] = useState10(0);
  const [page, setPage] = useState10(0);
  const columns = useMemo3(() => detectColumns(records), [records]);
  const totalPages = Math.max(1, Math.ceil(records.length / PAGE_SIZE2));
  const pageRows = records.slice(page * PAGE_SIZE2, (page + 1) * PAGE_SIZE2);
  const totalRows = records.length;
  useEffect4(() => {
    setRowIdx(0);
  }, [page]);
  useInput10((_, key) => {
    if (key.escape) {
      onBack();
      return;
    }
    if (key.upArrow) setRowIdx((i) => Math.max(0, i - 1));
    if (key.downArrow) setRowIdx((i) => Math.min(pageRows.length - 1, i + 1));
    if (key.leftArrow && page > 0) {
      setPage((p) => p - 1);
    }
    if (key.rightArrow && page < totalPages - 1) {
      setPage((p) => p + 1);
    }
  });
  const selectedRecord = pageRows[rowIdx];
  const COL_WIDTH = 22;
  return /* @__PURE__ */ jsxs14(Box13, { flexDirection: "column", paddingX: 2, paddingY: 1, gap: 1, children: [
    /* @__PURE__ */ jsxs14(Box13, { gap: 2, children: [
      /* @__PURE__ */ jsx13(Text14, { bold: true, color: "cyan", children: "\u6570\u636E\u9884\u89C8" }),
      /* @__PURE__ */ jsx13(Text14, { color: "gray", dimColor: true, children: basename2(filePath) }),
      /* @__PURE__ */ jsxs14(Text14, { color: "gray", dimColor: true, children: [
        "\u5171 ",
        totalRows,
        " \u6761"
      ] })
    ] }),
    /* @__PURE__ */ jsxs14(Box13, { gap: 1, children: [
      /* @__PURE__ */ jsx13(Text14, { color: "gray", dimColor: true, children: "  #".padEnd(5) }),
      columns.map((col) => /* @__PURE__ */ jsx13(Text14, { color: "gray", dimColor: true, children: truncate(col, COL_WIDTH).padEnd(COL_WIDTH) }, col))
    ] }),
    /* @__PURE__ */ jsx13(Box13, { flexDirection: "column", children: pageRows.map((rec, i) => {
      const globalN = page * PAGE_SIZE2 + i + 1;
      const isCursor = i === rowIdx;
      return /* @__PURE__ */ jsxs14(Box13, { gap: 1, children: [
        /* @__PURE__ */ jsxs14(Text14, { color: isCursor ? "cyan" : "gray", children: [
          isCursor ? SYM.cursor : " ",
          String(globalN).padEnd(3)
        ] }),
        columns.map((col) => /* @__PURE__ */ jsx13(
          Text14,
          {
            color: isCursor ? "white" : "gray",
            dimColor: !isCursor,
            wrap: "truncate",
            children: truncate(cellValue(rec, col), COL_WIDTH).padEnd(COL_WIDTH)
          },
          col
        ))
      ] }, i);
    }) }),
    selectedRecord && /* @__PURE__ */ jsxs14(
      Box13,
      {
        flexDirection: "column",
        borderStyle: "round",
        borderColor: "cyan",
        paddingX: 2,
        paddingY: 0,
        marginTop: 1,
        children: [
          /* @__PURE__ */ jsxs14(Text14, { bold: true, color: "cyan", children: [
            "\u8BE6\u60C5  \u884C ",
            page * PAGE_SIZE2 + rowIdx + 1
          ] }),
          columns.map((col) => /* @__PURE__ */ jsxs14(Box13, { gap: 2, children: [
            /* @__PURE__ */ jsx13(Text14, { color: "gray", dimColor: true, children: col.padEnd(20) }),
            /* @__PURE__ */ jsx13(Text14, { color: "white", wrap: "truncate", children: truncate(cellValue(selectedRecord, col), 80) })
          ] }, col))
        ]
      }
    ),
    /* @__PURE__ */ jsx13(Box13, { gap: 2, children: /* @__PURE__ */ jsxs14(Text14, { color: "gray", dimColor: true, children: [
      "\u7B2C ",
      page + 1,
      " / ",
      totalPages,
      " \u9875"
    ] }) }),
    /* @__PURE__ */ jsx13(KeyBar, { hints: [
      { key: "\u2191\u2193", label: "\u9009\u62E9\u884C" },
      { key: "\u2190\u2192", label: "\u7FFB\u9875" },
      { key: "ESC", label: "\u8FD4\u56DE" }
    ] })
  ] });
}
function DataPreview({ initialFile, onNav }) {
  const [selectedFile, setSelectedFile] = useState10(initialFile ?? null);
  const [records, setRecords] = useState10(null);
  const [loadError, setLoadError] = useState10("");
  const saved = getConfig();
  const scanDir = saved.outDir || "./out/";
  const fileItems = useMemo3(() => scanJsonFilesRecursive2(scanDir), [scanDir]);
  useInput10((_, key) => {
    if (key.escape && !selectedFile) onNav("menu");
  });
  useEffect4(() => {
    if (!selectedFile) return;
    try {
      const raw = readFileSync6(selectedFile, "utf-8");
      const data = JSON.parse(raw);
      const arr = extractRecords(data);
      setRecords(arr);
      setLoadError("");
    } catch (e) {
      setLoadError(e.message);
      setRecords(null);
    }
  }, [selectedFile]);
  if (selectedFile && records) {
    return /* @__PURE__ */ jsx13(
      TableView,
      {
        records,
        filePath: selectedFile,
        onBack: () => {
          setSelectedFile(null);
          setRecords(null);
        }
      }
    );
  }
  return /* @__PURE__ */ jsxs14(Box13, { flexDirection: "column", paddingX: 2, paddingY: 1, gap: 1, children: [
    /* @__PURE__ */ jsx13(Text14, { bold: true, color: "cyan", children: "\u9884\u89C8\u91C7\u96C6\u6570\u636E" }),
    loadError && /* @__PURE__ */ jsxs14(Text14, { color: "red", children: [
      SYM.cross,
      " \u52A0\u8F7D\u5931\u8D25\uFF1A",
      loadError
    ] }),
    fileItems.length === 0 ? /* @__PURE__ */ jsx13(Box13, { borderStyle: "round", borderColor: "gray", borderDimColor: true, paddingX: 2, children: /* @__PURE__ */ jsxs14(Text14, { color: "gray", dimColor: true, children: [
      scanDir,
      " \u4E2D\u6682\u65E0 .json \u6587\u4EF6"
    ] }) }) : /* @__PURE__ */ jsxs14(Box13, { flexDirection: "column", gap: 1, children: [
      /* @__PURE__ */ jsxs14(Text14, { color: "gray", dimColor: true, children: [
        "\u9009\u62E9\u8981\u9884\u89C8\u7684\u6587\u4EF6\uFF08\u5171 ",
        fileItems.length,
        " \u4E2A\uFF09"
      ] }),
      /* @__PURE__ */ jsx13(
        SelectInput6,
        {
          items: fileItems,
          onSelect: ({ value }) => setSelectedFile(value),
          indicatorComponent: Indicator5,
          itemComponent: Item5
        }
      )
    ] }),
    /* @__PURE__ */ jsx13(KeyBar, { hints: [
      { key: "Enter", label: "\u9884\u89C8" },
      { key: "ESC", label: "\u8FD4\u56DE\u83DC\u5355" }
    ] })
  ] });
}

// src/tui/App.js
import { jsx as jsx14, jsxs as jsxs15 } from "react/jsx-runtime";
var SUBTITLES = {
  menu: "\u591A\u5E73\u53F0\u5185\u5BB9\u98CE\u9669\u5BA1\u67E5",
  settings: "\u8BBE\u7F6E",
  "scrape-setup": "\u91C7\u96C6\u8BBE\u7F6E",
  "scrape-run": "\u91C7\u96C6\u8FD0\u884C\u4E2D",
  "classify-setup": "AI \u5206\u7C7B\u8BBE\u7F6E",
  "classify-run": "AI \u5206\u7C7B\u8FD0\u884C\u4E2D",
  jobs: "\u5206\u7C7B\u4EFB\u52A1\u5217\u8868",
  "data-preview": "\u6570\u636E\u9884\u89C8"
};
function App() {
  const [screen, setScreen] = useState11("menu");
  const [navParams, setParams] = useState11({});
  const { rows, columns } = useWindowSize();
  const onNav = (target, params = {}) => {
    setParams(params);
    setScreen(target);
  };
  return /* @__PURE__ */ jsxs15(Box14, { flexDirection: "column", width: columns, height: rows, children: [
    /* @__PURE__ */ jsx14(Header, { subtitle: SUBTITLES[screen] }),
    screen === "menu" && /* @__PURE__ */ jsx14(MainMenu, { onNav }),
    screen === "settings" && /* @__PURE__ */ jsx14(Settings, { onNav }),
    screen === "scrape-setup" && /* @__PURE__ */ jsx14(ScrapeSetup, { onNav }),
    screen === "scrape-run" && /* @__PURE__ */ jsx14(ScrapeRun, { config: navParams.scrapeConfig, onNav }),
    screen === "classify-setup" && /* @__PURE__ */ jsx14(ClassifySetup, { onNav }),
    screen === "classify-run" && /* @__PURE__ */ jsx14(ClassifyRun, { config: navParams.classifyConfig, onNav }),
    screen === "jobs" && /* @__PURE__ */ jsx14(JobsList, { onNav }),
    screen === "data-preview" && /* @__PURE__ */ jsx14(DataPreview, { initialFile: navParams.previewFile, onNav })
  ] });
}

// src/tui/main.js
import { jsx as jsx15 } from "react/jsx-runtime";
applyToEnv();
render(/* @__PURE__ */ jsx15(App, {}), { alternateScreen: true });
