import type { DiagramStyle } from "../notationAttrs";
import { loadJson, saveJson } from "@/utils/localStorage";
import componentStylesData from "./componentStyles.json";
import relationStylesData from "./relationStyles.json";

export interface ComponentStylePreset {
  name: string;
  label: string;
  style: DiagramStyle;
  _isUser?: boolean;
}

export interface RelationStylePreset {
  name: string;
  label: string;
  style: DiagramStyle;
  _isUser?: boolean;
}

// Type guards for JSON structure
interface StylePresetJson {
  name: string;
  label: string;
  style: Record<string, unknown>;
}

interface StylesData {
  presets: StylePresetJson[];
}

function isValidDiagramStyle(value: Record<string, unknown>): value is DiagramStyle {
  // Basic validation - DiagramStyle has optional properties
  // We accept any object with string/number/array values
  return typeof value === "object" && value !== null;
}

function normalizeStylePreset(data: StylePresetJson): { name: string; label: string; style: DiagramStyle } | null {
  if (typeof data.name !== "string" || !data.name) return null;
  if (typeof data.label !== "string" || !data.label) return null;
  if (typeof data.style !== "object" || data.style === null) return null;
  
  if (!isValidDiagramStyle(data.style)) return null;
  
  return {
    name: data.name,
    label: data.label,
    style: data.style as DiagramStyle
  };
}

// Load and validate component style presets
export function loadComponentStylePresets(): ComponentStylePreset[] {
  const data = componentStylesData as unknown as StylesData;
  
  if (!Array.isArray(data?.presets)) {
    console.warn("Invalid componentStyles.json structure");
    return [getDefaultComponentStylePreset()];
  }
  
  const presets = data.presets
    .map(normalizeStylePreset)
    .filter((p): p is ComponentStylePreset => p !== null);
  
  if (presets.length === 0) {
    return [getDefaultComponentStylePreset()];
  }
  
  return presets;
}

// Load and validate relation style presets
export function loadRelationStylePresets(): RelationStylePreset[] {
  const data = relationStylesData as unknown as StylesData;
  
  if (!Array.isArray(data?.presets)) {
    console.warn("Invalid relationStyles.json structure");
    return [getDefaultRelationStylePreset()];
  }
  
  const presets = data.presets
    .map(normalizeStylePreset)
    .filter((p): p is RelationStylePreset => p !== null);
  
  if (presets.length === 0) {
    return [getDefaultRelationStylePreset()];
  }
  
  return presets;
}

// Get default preset names
export function getDefaultComponentStylePresetName(): string {
  return "default";
}

export function getDefaultRelationStylePresetName(): string {
  return "default";
}

// Get default style objects
export function getDefaultComponentStyle(): DiagramStyle {
  return {
    fillColor: "#e0f2fe",
    strokeColor: "#0284c7",
    strokeWidth: 2,
    cornerRadius: 8,
    opacity: 1,
    labelColor: "#1e3a5f",
    labelFontSize: 14,
    labelInset: 8,
    labelPlacement: "center"
  };
}

export function getDefaultRelationStyle(): DiagramStyle {
  return {
    strokeColor: "#7c3aed",
    strokeWidth: 2,
    opacity: 1,
    edgeType: "polyline",
    startMarkerType: "none",
    endMarkerType: "open",
    labelColor: "#5b21b6",
    labelFontSize: 12,
    labelBgColor: "#ffffff"
  };
}

// Get default full presets
export function getDefaultComponentStylePreset(): ComponentStylePreset {
  return {
    name: "default",
    label: "По умолчанию",
    style: getDefaultComponentStyle()
  };
}

export function getDefaultRelationStylePreset(): RelationStylePreset {
  return {
    name: "default",
    label: "По умолчанию",
    style: getDefaultRelationStyle()
  };
}

// Apply preset by name (searches built-in + user presets)
export function applyComponentStylePreset(presetName: string): DiagramStyle {
  const presets = getAllComponentPresets();
  const preset = presets.find(p => p.name === presetName);

  if (!preset) {
    console.warn(`Component style preset "${presetName}" not found, using default`);
    return getDefaultComponentStyle();
  }

  return { ...preset.style };
}

export function applyRelationStylePreset(presetName: string): DiagramStyle {
  const presets = getAllRelationPresets();
  const preset = presets.find(p => p.name === presetName);

  if (!preset) {
    console.warn(`Relation style preset "${presetName}" not found, using default`);
    return getDefaultRelationStyle();
  }

  return { ...preset.style };
}

// Get preset label by name
export function getComponentStylePresetLabel(presetName: string): string {
  const presets = loadComponentStylePresets();
  const preset = presets.find(p => p.name === presetName);
  return preset?.label ?? presetName;
}

export function getRelationStylePresetLabel(presetName: string): string {
  const presets = loadRelationStylePresets();
  const preset = presets.find(p => p.name === presetName);
  return preset?.label ?? presetName;
}

// Get all preset names
export function getComponentStylePresetNames(): string[] {
  return loadComponentStylePresets().map(p => p.name);
}

export function getRelationStylePresetNames(): string[] {
  return loadRelationStylePresets().map(p => p.name);
}

// Merge style with preset (for updating specific properties)
export function mergeWithComponentPreset(
  baseStyle: DiagramStyle | undefined,
  presetName: string
): DiagramStyle {
  const preset = applyComponentStylePreset(presetName);
  
  if (!baseStyle) {
    return preset;
  }
  
  // Merge base style over preset (base takes precedence)
  return {
    ...preset,
    ...baseStyle
  };
}

export function mergeWithRelationPreset(
  baseStyle: DiagramStyle | undefined,
  presetName: string
): DiagramStyle {
  const preset = applyRelationStylePreset(presetName);

  if (!baseStyle) {
    return preset;
  }

  // Merge base style over preset (base takes precedence)
  return {
    ...preset,
    ...baseStyle
  };
}

// --- User presets (localStorage) ---

const USER_COMPONENT_PRESETS_KEY = "warchi:componentStylePresets";
const USER_RELATION_PRESETS_KEY = "warchi:relationStylePresets";
const STYLE_PRESETS_CHANGED_EVENT = "warchi:style-presets-changed";

interface StoredPreset {
  name: string;
  label: string;
  style: Record<string, unknown>;
}

function isValidPreset(p: unknown): p is StoredPreset {
  return (
    typeof p === "object" &&
    p !== null &&
    typeof (p as StoredPreset).name === "string" &&
    typeof (p as StoredPreset).label === "string" &&
    typeof (p as StoredPreset).style === "object"
  );
}

function readStoredPresets(key: string): StoredPreset[] {
  const raw = loadJson<StoredPreset[]>(key) ?? [];
  return raw.filter(isValidPreset);
}

function writeStoredPresets(key: string, presets: StoredPreset[]) {
  saveJson(key, presets);
}

function notifyStylePresetsChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(STYLE_PRESETS_CHANGED_EVENT));
}

export function subscribeStylePresetsChanges(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};

  const handleCustomChange = () => callback();
  const handleStorageChange = (event: StorageEvent) => {
    if (
      event.key === USER_COMPONENT_PRESETS_KEY ||
      event.key === USER_RELATION_PRESETS_KEY
    ) {
      callback();
    }
  };

  window.addEventListener(STYLE_PRESETS_CHANGED_EVENT, handleCustomChange);
  window.addEventListener("storage", handleStorageChange);

  return () => {
    window.removeEventListener(STYLE_PRESETS_CHANGED_EVENT, handleCustomChange);
    window.removeEventListener("storage", handleStorageChange);
  };
}

export function getUserComponentPresets(): ComponentStylePreset[] {
  return readStoredPresets(USER_COMPONENT_PRESETS_KEY).map(p => ({
    name: p.name,
    label: p.label,
    style: p.style as DiagramStyle,
    _isUser: true
  }));
}

export function getUserRelationPresets(): RelationStylePreset[] {
  return readStoredPresets(USER_RELATION_PRESETS_KEY).map(p => ({
    name: p.name,
    label: p.label,
    style: p.style as DiagramStyle,
    _isUser: true
  }));
}

export function saveUserComponentPreset(preset: ComponentStylePreset) {
  const stored = readStoredPresets(USER_COMPONENT_PRESETS_KEY);
  const idx = stored.findIndex(p => p.name === preset.name);
  const entry: StoredPreset = { name: preset.name, label: preset.label, style: preset.style as Record<string, unknown> };
  if (idx >= 0) {
    stored[idx] = entry;
  } else {
    stored.push(entry);
  }
  writeStoredPresets(USER_COMPONENT_PRESETS_KEY, stored);
  notifyStylePresetsChanged();
}

export function saveUserRelationPreset(preset: RelationStylePreset) {
  const stored = readStoredPresets(USER_RELATION_PRESETS_KEY);
  const idx = stored.findIndex(p => p.name === preset.name);
  const entry: StoredPreset = { name: preset.name, label: preset.label, style: preset.style as Record<string, unknown> };
  if (idx >= 0) {
    stored[idx] = entry;
  } else {
    stored.push(entry);
  }
  writeStoredPresets(USER_RELATION_PRESETS_KEY, stored);
  notifyStylePresetsChanged();
}

export function deleteUserComponentPreset(name: string) {
  const stored = readStoredPresets(USER_COMPONENT_PRESETS_KEY);
  writeStoredPresets(USER_COMPONENT_PRESETS_KEY, stored.filter(p => p.name !== name));
  notifyStylePresetsChanged();
}

export function deleteUserRelationPreset(name: string) {
  const stored = readStoredPresets(USER_RELATION_PRESETS_KEY);
  writeStoredPresets(USER_RELATION_PRESETS_KEY, stored.filter(p => p.name !== name));
  notifyStylePresetsChanged();
}

export function getAllComponentPresets(): ComponentStylePreset[] {
  const builtIn = loadComponentStylePresets();
  const user = getUserComponentPresets();
  return [...builtIn, ...user];
}

export function getAllRelationPresets(): RelationStylePreset[] {
  const builtIn = loadRelationStylePresets();
  const user = getUserRelationPresets();
  return [...builtIn, ...user];
}
