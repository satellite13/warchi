export type CustomPropertyType = "string" | "number" | "boolean" | "enum";

export type CustomProperty = {
  id: string;
  name: string;
  type: CustomPropertyType;
  required: boolean;
  regex?: string;
  min: number | null;
  max: number | null;
  maxLength?: number | null;
  enumValues?: string[];
  defaultValue?: string | number | boolean;
  enumDefault?: string;
  _fromType?: boolean;
};

export type NodeStyle = {
  fillColor?: string;
  strokeColor?: string;
  strokeWidth?: number;
  cornerRadius?: number;
};

export type DiagramStyle = {
  fillColor?: string;
  fillOpacity?: number;
  strokeColor?: string;
  strokeOpacity?: number;
  strokeWidth?: number;
  cornerRadius?: number;
  opacity?: number;
  lineDash?: number[];
  edgeType?: string;
  startMarkerType?: string;
  endMarkerType?: string;
  // Label properties (shared node+edge)
  labelColor?: string;
  labelOpacity?: number;
  labelFontSize?: number;
  // Label spacing
  labelPadding?: number;
  labelMargin?: number;
  labelPlacement?: string;
  labelAlign?: string;
  // Edge label background
  labelBgColor?: string;
  labelBgOpacity?: number;
  labelBgPadding?: number;
  labelBgBorderRadius?: number;
  edgeLabelOffset?: number;
  // Marker details
  startMarkerSize?: number;
  startMarkerFillColor?: string;
  startMarkerFillOpacity?: number;
  endMarkerSize?: number;
  endMarkerFillColor?: string;
  endMarkerFillOpacity?: number;
  // Node icon
  iconName?: string;
  iconPlacement?: string;
  iconWidth?: number;
  iconHeight?: number;
  iconPadding?: number;
  iconMargin?: number;
  iconGap?: number;
  iconStrokeColor?: string;
  iconFillColor?: string;
  // Node dimensions
  width?: number;
  height?: number;
  // Node anchor points
  portsTop?: number;
  portsBottom?: number;
  portsLeft?: number;
  portsRight?: number;
  // Node base shape
  nodeShape?: string;
  // Label template for composite labels
  labelTemplate?: string;
};

type RawRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is RawRecord =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

export const createId = () => {
  const cryptoApi =
    typeof globalThis !== "undefined" ? globalThis.crypto : undefined;
  if (cryptoApi?.randomUUID) {
    return cryptoApi.randomUUID();
  }
  return `id_${Date.now()}_${Math.random().toString(16).slice(2)}`;
};

const normalizeTags = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((tag) => (typeof tag === "string" ? tag.trim() : ""))
    .filter(Boolean);
};

const normalizeCustomProperties = (value: unknown): CustomProperty[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => {
    const record = isRecord(item) ? item : {};
    const type =
      record.type === "number" ||
      record.type === "boolean" ||
      record.type === "enum"
        ? record.type
        : "string";
    const defaultValueRaw = record.defaultValue;
    const enumDefaultRaw = typeof record.enumDefault === "string" ? record.enumDefault : undefined;
    let defaultValue: string | number | boolean | undefined;
    if ((type === "string" || type === "enum") && typeof defaultValueRaw === "string") {
      defaultValue = defaultValueRaw;
    } else if (type === "number" && typeof defaultValueRaw === "number" && Number.isFinite(defaultValueRaw)) {
      defaultValue = defaultValueRaw;
    } else if (type === "boolean" && typeof defaultValueRaw === "boolean") {
      defaultValue = defaultValueRaw;
    } else if (type === "enum" && typeof enumDefaultRaw === "string") {
      // Backward compatibility for older payloads.
      defaultValue = enumDefaultRaw;
    }

    return {
      id: typeof record.id === "string" ? record.id : createId(),
      name: typeof record.name === "string" ? record.name : "",
      type,
      required: Boolean(record.required),
      regex: typeof record.regex === "string" ? record.regex : undefined,
      min: typeof record.min === "number" ? record.min : null,
      max: typeof record.max === "number" ? record.max : null,
      maxLength: typeof record.maxLength === "number" ? record.maxLength : null,
      enumValues: Array.isArray(record.enumValues)
        ? record.enumValues.filter((val) => typeof val === "string")
        : undefined,
      defaultValue,
      enumDefault: type === "enum" && typeof defaultValue === "string" ? defaultValue : enumDefaultRaw
    };
  });
};

const normalizeDiagramStyle = (value: unknown): DiagramStyle | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }
  const style: DiagramStyle = {};
  if (typeof value.fillColor === "string") style.fillColor = value.fillColor;
  if (typeof value.fillOpacity === "number") style.fillOpacity = value.fillOpacity;
  if (typeof value.strokeColor === "string")
    style.strokeColor = value.strokeColor;
  if (typeof value.strokeOpacity === "number") style.strokeOpacity = value.strokeOpacity;
  if (typeof value.strokeWidth === "number")
    style.strokeWidth = value.strokeWidth;
  if (typeof value.cornerRadius === "number")
    style.cornerRadius = value.cornerRadius;
  if (typeof value.opacity === "number") style.opacity = value.opacity;
  if (Array.isArray(value.lineDash)) {
    const arr = value.lineDash.filter(
      (n: unknown) => typeof n === "number"
    ) as number[];
    if (arr.length > 0) style.lineDash = arr;
  }
  if (typeof value.edgeType === "string") style.edgeType = value.edgeType;
  if (typeof value.startMarkerType === "string")
    style.startMarkerType = value.startMarkerType;
  if (typeof value.endMarkerType === "string")
    style.endMarkerType = value.endMarkerType;
  if (typeof value.labelColor === "string") style.labelColor = value.labelColor;
  if (typeof value.labelOpacity === "number") style.labelOpacity = value.labelOpacity;
  if (typeof value.labelFontSize === "number")
    style.labelFontSize = value.labelFontSize;
  if (typeof value.labelPadding === "number")
    style.labelPadding = value.labelPadding;
  if (typeof value.labelMargin === "number")
    style.labelMargin = value.labelMargin;
  if (typeof value.labelPlacement === "string")
    style.labelPlacement = value.labelPlacement;
  if (typeof value.labelAlign === "string")
    style.labelAlign = value.labelAlign;
  if (typeof value.labelBgColor === "string")
    style.labelBgColor = value.labelBgColor;
  if (typeof value.labelBgOpacity === "number")
    style.labelBgOpacity = value.labelBgOpacity;
  if (typeof value.labelBgPadding === "number")
    style.labelBgPadding = value.labelBgPadding;
  if (typeof value.labelBgBorderRadius === "number")
    style.labelBgBorderRadius = value.labelBgBorderRadius;
  if (typeof value.edgeLabelOffset === "number")
    style.edgeLabelOffset = value.edgeLabelOffset;
  if (typeof value.startMarkerSize === "number")
    style.startMarkerSize = value.startMarkerSize;
  if (typeof value.startMarkerFillColor === "string")
    style.startMarkerFillColor = value.startMarkerFillColor;
  if (typeof value.startMarkerFillOpacity === "number")
    style.startMarkerFillOpacity = value.startMarkerFillOpacity;
  if (typeof value.endMarkerSize === "number")
    style.endMarkerSize = value.endMarkerSize;
  if (typeof value.endMarkerFillColor === "string")
    style.endMarkerFillColor = value.endMarkerFillColor;
  if (typeof value.endMarkerFillOpacity === "number")
    style.endMarkerFillOpacity = value.endMarkerFillOpacity;
  if (typeof value.iconName === "string") style.iconName = value.iconName;
  if (typeof value.iconPlacement === "string") style.iconPlacement = value.iconPlacement;
  if (typeof value.iconWidth === "number") style.iconWidth = value.iconWidth;
  if (typeof value.iconHeight === "number") style.iconHeight = value.iconHeight;
  if (typeof value.iconPadding === "number") style.iconPadding = value.iconPadding;
  if (typeof value.iconMargin === "number") style.iconMargin = value.iconMargin;
  if (typeof value.iconGap === "number") style.iconGap = value.iconGap;
  if (typeof value.iconStrokeColor === "string") style.iconStrokeColor = value.iconStrokeColor;
  if (typeof value.iconFillColor === "string") style.iconFillColor = value.iconFillColor;
  if (typeof value.width === "number") style.width = value.width;
  if (typeof value.height === "number") style.height = value.height;
  if (typeof value.portsTop === "number") style.portsTop = value.portsTop;
  if (typeof value.portsBottom === "number") style.portsBottom = value.portsBottom;
  if (typeof value.portsLeft === "number") style.portsLeft = value.portsLeft;
  if (typeof value.portsRight === "number") style.portsRight = value.portsRight;
  if (typeof value.nodeShape === "string") style.nodeShape = value.nodeShape;
  if (typeof value.labelTemplate === "string") style.labelTemplate = value.labelTemplate;
  return Object.keys(style).length ? style : undefined;
};

const normalizeStyle = (value: unknown): NodeStyle | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }
  const style: NodeStyle = {};
  if (typeof value.fillColor === "string") {
    style.fillColor = value.fillColor;
  }
  if (typeof value.strokeColor === "string") {
    style.strokeColor = value.strokeColor;
  }
  if (typeof value.strokeWidth === "number") {
    style.strokeWidth = value.strokeWidth;
  }
  if (typeof value.cornerRadius === "number") {
    style.cornerRadius = value.cornerRadius;
  }
  return Object.keys(style).length ? style : undefined;
};

// Types for parsed attrs
export type EntityAttrs = {
  tags: string[];
  customProperties: CustomProperty[];
  diagramStyle?: DiagramStyle;
};

export type TypeAttrs = {
  style?: NodeStyle;
  width?: number;
  height?: number;
  cornerRadius?: number;
  defaultDirectoryPath?: string;
  customProperties?: CustomProperty[];
};

// Parse entity attrs (for components/relations)
export const parseEntityAttrs = (attrs: string | null): EntityAttrs => {
  if (!attrs) {
    return { tags: [], customProperties: [] };
  }

  try {
    const parsed = JSON.parse(attrs) as unknown;
    const record = isRecord(parsed) ? parsed : {};

    const result: EntityAttrs = {
      tags: normalizeTags(record.tags),
      customProperties: normalizeCustomProperties(record.customProperties)
    };
    const diagramStyle = normalizeDiagramStyle(record.diagramStyle);
    if (diagramStyle) {
      result.diagramStyle = diagramStyle;
    }
    return result;
  } catch {
    return { tags: [], customProperties: [] };
  }
};

// Serialize entity attrs (for components/relations)
const stripInternalFlags = (props: CustomProperty[]): Omit<CustomProperty, '_fromType'>[] =>
  props.map(({ _fromType, ...rest }) => rest);

export const serializeEntityAttrs = (attrs: EntityAttrs): string => {
  const result: Record<string, unknown> = {
    tags: attrs.tags,
    customProperties: stripInternalFlags(attrs.customProperties)
  };
  if (attrs.diagramStyle) {
    result.diagramStyle = attrs.diagramStyle;
  }
  return JSON.stringify(result);
};

// Parse type attrs (for node-types/link-types)
export const parseTypeAttrs = (attrs: string | null): TypeAttrs => {
  if (!attrs) {
    return {};
  }

  try {
    const parsed = JSON.parse(attrs) as unknown;
    const record = isRecord(parsed) ? parsed : {};

    const result: TypeAttrs = {};

    const style = normalizeStyle(record.style);
    if (style) {
      result.style = style;
    }

    if (typeof record.width === "number") {
      result.width = record.width;
    }
    if (typeof record.height === "number") {
      result.height = record.height;
    }
    if (typeof record.cornerRadius === "number") {
      result.cornerRadius = record.cornerRadius;
    }
    if (typeof record.defaultDirectoryPath === "string") {
      const normalizedPath = record.defaultDirectoryPath.trim();
      if (normalizedPath.length > 0) {
        result.defaultDirectoryPath = normalizedPath;
      }
    }

    const customProperties = normalizeCustomProperties(record.customProperties);
    if (customProperties.length > 0) {
      result.customProperties = customProperties;
    }

    return result;
  } catch {
    return {};
  }
};

// Serialize type attrs (for node-types/link-types)
export const serializeTypeAttrs = (attrs: TypeAttrs): string => {
  const result: Record<string, unknown> = {};

  if (attrs.style) {
    result.style = attrs.style;
  }
  if (typeof attrs.width === "number") {
    result.width = attrs.width;
  }
  if (typeof attrs.height === "number") {
    result.height = attrs.height;
  }
  if (typeof attrs.cornerRadius === "number") {
    result.cornerRadius = attrs.cornerRadius;
  }
  if (typeof attrs.defaultDirectoryPath === "string" && attrs.defaultDirectoryPath.trim().length > 0) {
    result.defaultDirectoryPath = attrs.defaultDirectoryPath.trim();
  }
  if (attrs.customProperties && attrs.customProperties.length > 0) {
    result.customProperties = stripInternalFlags(attrs.customProperties);
  }
  return JSON.stringify(result);
};
