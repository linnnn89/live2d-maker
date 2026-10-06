// Generated from schemas/studio/protocol.schema.json; run npm run protocol:generate.

/**
 * @minItems 2
 * @maxItems 2
 *
 * This interface was referenced by `StudioProtocol`'s JSON-Schema
 * via the `definition` "Point".
 */
export type Point = [number, number];
/**
 * @minItems 4
 * @maxItems 4
 *
 * This interface was referenced by `StudioProtocol`'s JSON-Schema
 * via the `definition` "Bounds".
 */
export type Bounds = [number, number, number, number];
/**
 * This interface was referenced by `StudioProtocol`'s JSON-Schema
 * via the `definition` "EditCommand".
 */
export type EditCommand =
  | {
      type: "set_visibility";
      partId: string;
      visible: boolean;
    }
  | {
      type: "set_opacity";
      partId: string;
      opacity: number;
    }
  | {
      type: "set_polygon";
      partId: string;
      /**
       * @minItems 3
       */
      points: Point[];
    }
  | {
      type: "set_landmark";
      partId: string;
      name: string;
      point: Point;
    }
  | {
      type: "remove_landmark";
      partId: string;
      name: string;
    }
  | {
      type: "set_semantic";
      partId: string;
      tag:
        | "BACK_HAIR"
        | "FRONT_HAIR"
        | "HEADWEAR"
        | "FACE"
        | "FACE_DETAIL"
        | "IRIDES"
        | "EYEBROW"
        | "EYEWHITE"
        | "EYELASH"
        | "EYE_CLOSE"
        | "EYEWEAR"
        | "EARS"
        | "EARWEAR"
        | "NOSE"
        | "MOUTH"
        | "MOUTH_OPEN"
        | "MOUTH_CLOSE"
        | "TOOTH_T"
        | "TOOTH_B"
        | "TONGUE"
        | "NECK"
        | "NECKWEAR"
        | "TOPWEAR"
        | "HANDWEAR"
        | "BOTTOMWEAR"
        | "LEGWEAR"
        | "FOOTWEAR"
        | "TAIL"
        | "WINGS"
        | "OBJECTS"
        | "UNKNOWN";
      side: "none" | "left" | "right";
    }
  | {
      type: "reset_semantic";
      partId: string;
    };
/**
 * @minItems 1
 *
 * This interface was referenced by `StudioProtocol`'s JSON-Schema
 * via the `definition` "CommandBatch".
 */
export type CommandBatch = EditCommand[];
/**
 * This interface was referenced by `StudioProtocol`'s JSON-Schema
 * via the `definition` "DraftRequest".
 */
export type DraftRequest =
  | {
      schemaVersion: 1;
      operation: "inspect" | "diff";
      response?: "full" | "summary" | "parts";
      partIds?: string[];
    }
  | {
      schemaVersion: 1;
      operation: "apply";
      state: DraftToken;
      commands: CommandBatch;
    }
  | {
      schemaVersion: 1;
      operation: "undo" | "redo" | "discard" | "commit";
      state: DraftToken;
    };
/**
 * This interface was referenced by `StudioProtocol`'s JSON-Schema
 * via the `definition` "ProjectCatalogRequest".
 */
export type ProjectCatalogRequest =
  | {
      schemaVersion: 1;
      operation: "list";
    }
  | {
      schemaVersion: 1;
      operation: "create";
      input: ProjectCreateRequest;
    };

/**
 * Studio envelope version 1. ArtworkIR here is the transport subset; persistence validates the complete authoring-rig schema.
 */
export interface StudioProtocol {
  [k: string]: unknown;
}
/**
 * This interface was referenced by `StudioProtocol`'s JSON-Schema
 * via the `definition` "Part".
 */
export interface Part {
  id: string;
  name: string;
  z: number;
  asset: {
    path: string;
    offset: {
      left: number;
      top: number;
    };
    size: {
      width: number;
      height: number;
    };
    [k: string]: unknown;
  };
  geometry: {
    bbox: Bounds;
    polygon?: Point[];
    landmarks?: {
      [k: string]: Point;
    };
    [k: string]: unknown;
  };
  appearance?: {
    visible: boolean;
    opacity: number;
  };
  semantic: {
    tag: string;
    side: string;
    override?: SemanticOverride;
    [k: string]: unknown;
  };
  [k: string]: unknown;
}
/**
 * This interface was referenced by `StudioProtocol`'s JSON-Schema
 * via the `definition` "SemanticOverride".
 */
export interface SemanticOverride {
  tag:
    | "BACK_HAIR"
    | "FRONT_HAIR"
    | "HEADWEAR"
    | "FACE"
    | "FACE_DETAIL"
    | "IRIDES"
    | "EYEBROW"
    | "EYEWHITE"
    | "EYELASH"
    | "EYE_CLOSE"
    | "EYEWEAR"
    | "EARS"
    | "EARWEAR"
    | "NOSE"
    | "MOUTH"
    | "MOUTH_OPEN"
    | "MOUTH_CLOSE"
    | "TOOTH_T"
    | "TOOTH_B"
    | "TONGUE"
    | "NECK"
    | "NECKWEAR"
    | "TOPWEAR"
    | "HANDWEAR"
    | "BOTTOMWEAR"
    | "LEGWEAR"
    | "FOOTWEAR"
    | "TAIL"
    | "WINGS"
    | "OBJECTS"
    | "UNKNOWN";
  side: "none" | "left" | "right";
}
/**
 * This interface was referenced by `StudioProtocol`'s JSON-Schema
 * via the `definition` "ArtworkIR".
 */
export interface ArtworkIR {
  canvas: {
    width: number;
    height: number;
  };
  parts: Part[];
  metadata?: {
    name?: string;
    [k: string]: unknown;
  };
  [k: string]: unknown;
}
/**
 * This interface was referenced by `StudioProtocol`'s JSON-Schema
 * via the `definition` "DraftToken".
 */
export interface DraftToken {
  draftId: string;
  revision: number;
  [k: string]: unknown;
}
/**
 * This interface was referenced by `StudioProtocol`'s JSON-Schema
 * via the `definition` "CaptureRequest".
 */
export interface CaptureRequest {
  schemaVersion: 1;
  state: DraftToken;
  source?: "draft" | "saved";
}
/**
 * This interface was referenced by `StudioProtocol`'s JSON-Schema
 * via the `definition` "OfflineRequest".
 */
export interface OfflineRequest {
  schemaVersion: 1;
  baseRevision: string;
  ir: ArtworkIR;
  commands: CommandBatch;
}
/**
 * This interface was referenced by `StudioProtocol`'s JSON-Schema
 * via the `definition` "StudioError".
 */
export interface StudioError {
  code: string;
  stage: string;
  message: string;
  retryable: boolean;
  partId?: string;
  field?: string;
}
/**
 * This interface was referenced by `StudioProtocol`'s JSON-Schema
 * via the `definition` "Snapshot".
 */
export interface Snapshot {
  schemaVersion: 1;
  status: "ok";
  ir: ArtworkIR;
  revision: string;
  sourceImage: string;
  artworkImage?: string;
  sourceBounds: Bounds | null;
  artworkBounds: Bounds | null;
  stale: {
    [k: string]: boolean;
  };
  overlay: {
    status: string;
    reasons: string[];
    [k: string]: unknown;
  };
  build: {
    modelUrl: string;
    modelBounds: Bounds | null;
    revision: string;
    modelSha256?: string;
    labelCount?: number;
    warnings?: string[];
    classifications?: {
      partId: string;
      componentId: string;
      sourceLayerId: string;
      automaticTag?: string;
      automaticSide?: string;
      semanticTag: string;
      side: string;
      drawable: string;
      [k: string]: unknown;
    }[];
    buildSettings?: BuildSettings;
    [k: string]: unknown;
  } | null;
  qa: {
    status: string;
    contactSheet: string;
    reviewUrl: string;
    revision: string;
    poses: number;
    [k: string]: unknown;
  } | null;
  workspaceId: string;
  buildSettings?: BuildSettingsState;
  project?: ProjectSummary;
  overlayRevision?: string;
  export?: null | {
    result: ModelExportResult;
    current: boolean;
  };
  [k: string]: unknown;
}
/**
 * This interface was referenced by `StudioProtocol`'s JSON-Schema
 * via the `definition` "BuildSettings".
 */
export interface BuildSettings {
  schemaVersion: 1;
  atlasSize: 1024 | 2048 | 4096;
  meshInteriorDensity: number;
  headTurnStrength: number;
}
/**
 * This interface was referenced by `StudioProtocol`'s JSON-Schema
 * via the `definition` "BuildSettingsState".
 */
export interface BuildSettingsState {
  settings: BuildSettings;
  revision: string;
}
/**
 * This interface was referenced by `StudioProtocol`'s JSON-Schema
 * via the `definition` "ProjectSummary".
 */
export interface ProjectSummary {
  id: string;
  name: string;
  updatedAt: string;
  parts: number;
  head: string | null;
}
/**
 * This interface was referenced by `StudioProtocol`'s JSON-Schema
 * via the `definition` "ModelExportResult".
 */
export interface ModelExportResult {
  schemaVersion: 1;
  target: "playable" | "editor";
  url: string;
  filename: string;
  files: ModelExportFile[];
  warnings: string[];
  cacheId: string;
  reused: boolean;
  buildSettings: BuildSettings;
  physics: boolean;
  motions: number;
  modelSha256: string;
  modelInputSignature: string;
  overlayRevision: string;
}
/**
 * This interface was referenced by `StudioProtocol`'s JSON-Schema
 * via the `definition` "ModelExportFile".
 */
export interface ModelExportFile {
  name: string;
  bytes: number;
  sha256: string;
}
/**
 * This interface was referenced by `StudioProtocol`'s JSON-Schema
 * via the `definition` "SaveRequest".
 */
export interface SaveRequest {
  schemaVersion?: 1;
  revision: string;
  ir: ArtworkIR;
}
/**
 * This interface was referenced by `StudioProtocol`'s JSON-Schema
 * via the `definition` "ImportPreviewRequest".
 */
export interface ImportPreviewRequest {
  schemaVersion?: 1;
  revision: string;
  generatedPng: string;
  maskPng: string;
  bounds: Bounds;
  name: string;
  prompt?: string;
  replacePart?: string | null;
  fit?: boolean;
  spriteBounds?: Bounds | null;
}
/**
 * This interface was referenced by `StudioProtocol`'s JSON-Schema
 * via the `definition` "ImportCommitRequest".
 */
export interface ImportCommitRequest {
  schemaVersion?: 1;
  id: string;
  revision: string;
}
/**
 * This interface was referenced by `StudioProtocol`'s JSON-Schema
 * via the `definition` "ImportPreview".
 */
export interface ImportPreview {
  schemaVersion: 1;
  id: string;
  revision: string;
  partId: string;
  name: string;
  semantic: {
    tag: string;
    [k: string]: unknown;
  };
  beforeImage: string;
  afterImage: string;
  report: {
    bounds: Bounds;
    changed_pixels: number;
    outside_visible_pixels: number;
    outside_changed_pixels: number;
    outside_max_diff: number;
    registration: {
      input_size: Point;
      fitted_size?: Point;
      excluded_visible_pixels?: number;
      [k: string]: unknown;
    };
    [k: string]: unknown;
  };
  [k: string]: unknown;
}
/**
 * This interface was referenced by `StudioProtocol`'s JSON-Schema
 * via the `definition` "DraftCheckpoint".
 */
export interface DraftCheckpoint {
  /**
   * @minItems 1
   */
  changes: {
    partId: string;
    field: string;
    after: unknown;
    before: unknown;
  }[];
  draftId: string;
  revision: number;
  baseRevision: string;
  updatedAt: number;
  schemaVersion: 1;
  workspaceId: string;
}
/**
 * This interface was referenced by `StudioProtocol`'s JSON-Schema
 * via the `definition` "BuildSettingsRequest".
 */
export interface BuildSettingsRequest {
  schemaVersion: 1;
  revision: string;
  settingsRevision: string;
  settings: BuildSettings;
}
/**
 * This interface was referenced by `StudioProtocol`'s JSON-Schema
 * via the `definition` "ProjectCatalog".
 */
export interface ProjectCatalog {
  schemaVersion: 1;
  projects: ProjectSummary[];
}
/**
 * This interface was referenced by `StudioProtocol`'s JSON-Schema
 * via the `definition` "ProjectCreateRequest".
 */
export interface ProjectCreateRequest {
  schemaVersion: 1;
  kind: "psd" | "archive";
  name: string;
  data: string;
}
/**
 * This interface was referenced by `StudioProtocol`'s JSON-Schema
 * via the `definition` "ProjectIssue".
 */
export interface ProjectIssue {
  location: string;
  name: string;
  reasons: string[];
}
/**
 * This interface was referenced by `StudioProtocol`'s JSON-Schema
 * via the `definition` "ProjectCreateResult".
 */
export interface ProjectCreateResult {
  schemaVersion: 1;
  status: "ok" | "unsupported";
  project: ProjectSummary | null;
  issues: ProjectIssue[];
}
/**
 * This interface was referenced by `StudioProtocol`'s JSON-Schema
 * via the `definition` "ProjectRevision".
 */
export interface ProjectRevision {
  id: string;
  parent: string | null;
  createdAt: string;
  message: string;
}
/**
 * This interface was referenced by `StudioProtocol`'s JSON-Schema
 * via the `definition` "ProjectRevisions".
 */
export interface ProjectRevisions {
  schemaVersion: 1;
  head: string;
  revisions: ProjectRevision[];
}
/**
 * This interface was referenced by `StudioProtocol`'s JSON-Schema
 * via the `definition` "ProjectSaveRequest".
 */
export interface ProjectSaveRequest {
  schemaVersion: 1;
  revision: string;
  settingsRevision: string;
  head: string;
  message: string;
  overlayRevision?: string;
}
/**
 * This interface was referenced by `StudioProtocol`'s JSON-Schema
 * via the `definition` "ProjectRestoreRequest".
 */
export interface ProjectRestoreRequest {
  schemaVersion: 1;
  revision: string;
  settingsRevision: string;
  head: string;
  id: string;
  overlayRevision?: string;
}
/**
 * This interface was referenced by `StudioProtocol`'s JSON-Schema
 * via the `definition` "ProjectDownload".
 */
export interface ProjectDownload {
  schemaVersion: 1;
  url: string;
  filename: string;
  files: number;
}
/**
 * This interface was referenced by `StudioProtocol`'s JSON-Schema
 * via the `definition` "ModelExportRequest".
 */
export interface ModelExportRequest {
  schemaVersion: 1;
  revision: string;
  settingsRevision: string;
  overlayRevision: string;
  target: "playable" | "editor";
  exportMotions: boolean;
  generatePhysics: boolean;
}

export const protocolSchema = {"$schema":"http://json-schema.org/draft-07/schema#","$id":"https://live2d-maker.local/schemas/studio/v1","title":"StudioProtocol","description":"Studio envelope version 1. ArtworkIR here is the transport subset; persistence validates the complete authoring-rig schema.","definitions":{"Point":{"type":"array","items":[{"type":"number"},{"type":"number"}],"minItems":2,"maxItems":2,"additionalItems":false},"Bounds":{"type":"array","items":[{"type":"number"},{"type":"number"},{"type":"number"},{"type":"number"}],"minItems":4,"maxItems":4,"additionalItems":false},"Part":{"type":"object","properties":{"id":{"type":"string","minLength":1},"name":{"type":"string"},"z":{"type":"number"},"asset":{"type":"object","properties":{"path":{"type":"string"},"offset":{"type":"object","properties":{"left":{"type":"number"},"top":{"type":"number"}},"required":["left","top"],"additionalProperties":false},"size":{"type":"object","properties":{"width":{"type":"number"},"height":{"type":"number"}},"required":["width","height"],"additionalProperties":false}},"required":["path","offset","size"],"additionalProperties":true},"geometry":{"type":"object","properties":{"bbox":{"$ref":"#/definitions/Bounds"},"polygon":{"type":"array","items":{"$ref":"#/definitions/Point"}},"landmarks":{"type":"object","additionalProperties":{"$ref":"#/definitions/Point"}}},"required":["bbox"],"additionalProperties":true},"appearance":{"type":"object","properties":{"visible":{"type":"boolean"},"opacity":{"type":"integer","minimum":0,"maximum":255}},"required":["visible","opacity"],"additionalProperties":false},"semantic":{"type":"object","properties":{"tag":{"type":"string"},"side":{"type":"string"},"override":{"$ref":"#/definitions/SemanticOverride"}},"required":["tag","side"],"additionalProperties":true}},"required":["id","name","z","asset","geometry","semantic"],"additionalProperties":true},"ArtworkIR":{"type":"object","properties":{"canvas":{"type":"object","properties":{"width":{"type":"number"},"height":{"type":"number"}},"required":["width","height"],"additionalProperties":false},"parts":{"type":"array","items":{"$ref":"#/definitions/Part"}},"metadata":{"type":"object","properties":{"name":{"type":"string"}},"required":[],"additionalProperties":true}},"required":["canvas","parts"],"additionalProperties":true},"DraftToken":{"type":"object","properties":{"draftId":{"type":"string","minLength":1},"revision":{"type":"integer","minimum":0}},"required":["draftId","revision"],"additionalProperties":true},"EditCommand":{"oneOf":[{"type":"object","properties":{"type":{"const":"set_visibility"},"partId":{"type":"string"},"visible":{"type":"boolean"}},"required":["type","partId","visible"],"additionalProperties":false},{"type":"object","properties":{"type":{"const":"set_opacity"},"partId":{"type":"string"},"opacity":{"type":"integer","minimum":0,"maximum":255}},"required":["type","partId","opacity"],"additionalProperties":false},{"type":"object","properties":{"type":{"const":"set_polygon"},"partId":{"type":"string"},"points":{"type":"array","items":{"$ref":"#/definitions/Point"},"minItems":3}},"required":["type","partId","points"],"additionalProperties":false},{"type":"object","properties":{"type":{"const":"set_landmark"},"partId":{"type":"string"},"name":{"type":"string"},"point":{"$ref":"#/definitions/Point"}},"required":["type","partId","name","point"],"additionalProperties":false},{"type":"object","properties":{"type":{"const":"remove_landmark"},"partId":{"type":"string"},"name":{"type":"string"}},"required":["type","partId","name"],"additionalProperties":false},{"type":"object","properties":{"type":{"const":"set_semantic"},"partId":{"type":"string"},"tag":{"type":"string","enum":["BACK_HAIR","FRONT_HAIR","HEADWEAR","FACE","FACE_DETAIL","IRIDES","EYEBROW","EYEWHITE","EYELASH","EYE_CLOSE","EYEWEAR","EARS","EARWEAR","NOSE","MOUTH","MOUTH_OPEN","MOUTH_CLOSE","TOOTH_T","TOOTH_B","TONGUE","NECK","NECKWEAR","TOPWEAR","HANDWEAR","BOTTOMWEAR","LEGWEAR","FOOTWEAR","TAIL","WINGS","OBJECTS","UNKNOWN"]},"side":{"type":"string","enum":["none","left","right"]}},"required":["type","partId","tag","side"],"additionalProperties":false},{"type":"object","properties":{"type":{"const":"reset_semantic"},"partId":{"type":"string"}},"required":["type","partId"],"additionalProperties":false}]},"CommandBatch":{"type":"array","items":{"$ref":"#/definitions/EditCommand"},"minItems":1},"DraftRequest":{"oneOf":[{"type":"object","properties":{"schemaVersion":{"const":1},"operation":{"enum":["inspect","diff"]},"response":{"enum":["full","summary","parts"]},"partIds":{"type":"array","items":{"type":"string"},"uniqueItems":true}},"required":["schemaVersion","operation"],"additionalProperties":false},{"type":"object","properties":{"schemaVersion":{"const":1},"operation":{"const":"apply"},"state":{"$ref":"#/definitions/DraftToken"},"commands":{"$ref":"#/definitions/CommandBatch"}},"required":["schemaVersion","operation","state","commands"],"additionalProperties":false},{"type":"object","properties":{"schemaVersion":{"const":1},"operation":{"enum":["undo","redo","discard","commit"]},"state":{"$ref":"#/definitions/DraftToken"}},"required":["schemaVersion","operation","state"],"additionalProperties":false}]},"CaptureRequest":{"type":"object","properties":{"schemaVersion":{"const":1},"state":{"$ref":"#/definitions/DraftToken"},"source":{"enum":["draft","saved"]}},"required":["schemaVersion","state"],"additionalProperties":false},"OfflineRequest":{"type":"object","properties":{"schemaVersion":{"const":1},"baseRevision":{"type":"string","minLength":1},"ir":{"$ref":"#/definitions/ArtworkIR"},"commands":{"$ref":"#/definitions/CommandBatch"}},"required":["schemaVersion","baseRevision","ir","commands"],"additionalProperties":false},"StudioError":{"type":"object","properties":{"code":{"type":"string","minLength":1},"stage":{"type":"string","minLength":1},"message":{"type":"string"},"retryable":{"type":"boolean"},"partId":{"type":"string"},"field":{"type":"string"}},"required":["code","stage","message","retryable"],"additionalProperties":false},"Snapshot":{"type":"object","properties":{"schemaVersion":{"const":1},"status":{"const":"ok"},"ir":{"$ref":"#/definitions/ArtworkIR"},"revision":{"type":"string","minLength":1},"sourceImage":{"type":"string"},"artworkImage":{"type":"string"},"sourceBounds":{"anyOf":[{"$ref":"#/definitions/Bounds"},{"type":"null"}]},"artworkBounds":{"anyOf":[{"$ref":"#/definitions/Bounds"},{"type":"null"}]},"stale":{"type":"object","additionalProperties":{"type":"boolean"}},"overlay":{"type":"object","properties":{"status":{"type":"string"},"reasons":{"type":"array","items":{"type":"string"}}},"required":["status","reasons"],"additionalProperties":true},"build":{"anyOf":[{"type":"object","properties":{"modelUrl":{"type":"string"},"modelBounds":{"anyOf":[{"$ref":"#/definitions/Bounds"},{"type":"null"}]},"revision":{"type":"string"},"modelSha256":{"type":"string"},"labelCount":{"type":"number"},"warnings":{"type":"array","items":{"type":"string"}},"classifications":{"type":"array","items":{"type":"object","properties":{"partId":{"type":"string"},"componentId":{"type":"string"},"sourceLayerId":{"type":"string"},"automaticTag":{"type":"string"},"automaticSide":{"type":"string"},"semanticTag":{"type":"string"},"side":{"type":"string"},"drawable":{"type":"string"}},"required":["partId","componentId","sourceLayerId","semanticTag","side","drawable"],"additionalProperties":true}},"buildSettings":{"$ref":"#/definitions/BuildSettings"}},"required":["modelUrl","modelBounds","revision"],"additionalProperties":true},{"type":"null"}]},"qa":{"anyOf":[{"type":"object","properties":{"status":{"type":"string"},"contactSheet":{"type":"string"},"reviewUrl":{"type":"string"},"revision":{"type":"string"},"poses":{"type":"number"}},"required":["status","contactSheet","reviewUrl","revision","poses"],"additionalProperties":true},{"type":"null"}]},"workspaceId":{"pattern":"^[a-f0-9]{32}$","type":"string"},"buildSettings":{"$ref":"#/definitions/BuildSettingsState"},"project":{"$ref":"#/definitions/ProjectSummary"},"overlayRevision":{"type":"string","pattern":"^[a-f0-9]{64}$"},"export":{"anyOf":[{"type":"null"},{"type":"object","properties":{"result":{"$ref":"#/definitions/ModelExportResult"},"current":{"type":"boolean"}},"required":["result","current"],"additionalProperties":false}]}},"required":["schemaVersion","status","ir","revision","sourceImage","sourceBounds","artworkBounds","stale","overlay","build","qa","workspaceId"],"additionalProperties":true},"SaveRequest":{"type":"object","properties":{"schemaVersion":{"const":1},"revision":{"type":"string","minLength":1},"ir":{"$ref":"#/definitions/ArtworkIR"}},"required":["revision","ir"],"additionalProperties":false},"ImportPreviewRequest":{"type":"object","properties":{"schemaVersion":{"const":1},"revision":{"type":"string","minLength":1},"generatedPng":{"type":"string"},"maskPng":{"type":"string"},"bounds":{"$ref":"#/definitions/Bounds"},"name":{"type":"string"},"prompt":{"type":"string"},"replacePart":{"type":["string","null"]},"fit":{"type":"boolean"},"spriteBounds":{"anyOf":[{"$ref":"#/definitions/Bounds"},{"type":"null"}]}},"required":["revision","generatedPng","maskPng","bounds","name"],"additionalProperties":false},"ImportCommitRequest":{"type":"object","properties":{"schemaVersion":{"const":1},"id":{"type":"string","pattern":"^[a-f0-9]{32}$"},"revision":{"type":"string","minLength":1}},"required":["id","revision"],"additionalProperties":false},"ImportPreview":{"type":"object","properties":{"schemaVersion":{"const":1},"id":{"type":"string"},"revision":{"type":"string"},"partId":{"type":"string"},"name":{"type":"string"},"semantic":{"type":"object","properties":{"tag":{"type":"string"}},"required":["tag"],"additionalProperties":true},"beforeImage":{"type":"string"},"afterImage":{"type":"string"},"report":{"type":"object","properties":{"bounds":{"$ref":"#/definitions/Bounds"},"changed_pixels":{"type":"number"},"outside_visible_pixels":{"type":"number"},"outside_changed_pixels":{"type":"number"},"outside_max_diff":{"type":"number"},"registration":{"type":"object","properties":{"input_size":{"$ref":"#/definitions/Point"},"fitted_size":{"$ref":"#/definitions/Point"},"excluded_visible_pixels":{"type":"number"}},"required":["input_size"],"additionalProperties":true}},"required":["bounds","changed_pixels","outside_visible_pixels","outside_changed_pixels","outside_max_diff","registration"],"additionalProperties":true}},"required":["schemaVersion","id","revision","partId","name","semantic","beforeImage","afterImage","report"],"additionalProperties":true},"DraftCheckpoint":{"additionalProperties":false,"type":"object","required":["schemaVersion","workspaceId","draftId","baseRevision","revision","updatedAt","changes"],"properties":{"changes":{"items":{"additionalProperties":false,"type":"object","required":["partId","field","before","after"],"properties":{"partId":{"type":"string"},"field":{"type":"string"},"after":{},"before":{}}},"type":"array","minItems":1},"draftId":{"minLength":1,"type":"string"},"revision":{"minimum":0,"type":"integer"},"baseRevision":{"minLength":1,"type":"string"},"updatedAt":{"minimum":0,"type":"integer"},"schemaVersion":{"const":1},"workspaceId":{"pattern":"^[a-f0-9]{32}$","type":"string"}}},"SemanticOverride":{"type":"object","properties":{"tag":{"type":"string","enum":["BACK_HAIR","FRONT_HAIR","HEADWEAR","FACE","FACE_DETAIL","IRIDES","EYEBROW","EYEWHITE","EYELASH","EYE_CLOSE","EYEWEAR","EARS","EARWEAR","NOSE","MOUTH","MOUTH_OPEN","MOUTH_CLOSE","TOOTH_T","TOOTH_B","TONGUE","NECK","NECKWEAR","TOPWEAR","HANDWEAR","BOTTOMWEAR","LEGWEAR","FOOTWEAR","TAIL","WINGS","OBJECTS","UNKNOWN"]},"side":{"type":"string","enum":["none","left","right"]}},"required":["tag","side"],"additionalProperties":false},"BuildSettings":{"type":"object","properties":{"schemaVersion":{"const":1},"atlasSize":{"type":"integer","enum":[1024,2048,4096]},"meshInteriorDensity":{"type":"number","minimum":12,"maximum":80},"headTurnStrength":{"type":"number","minimum":0,"maximum":2}},"required":["schemaVersion","atlasSize","meshInteriorDensity","headTurnStrength"],"additionalProperties":false},"BuildSettingsState":{"type":"object","properties":{"settings":{"$ref":"#/definitions/BuildSettings"},"revision":{"type":"string","pattern":"^[a-f0-9]{64}$"}},"required":["settings","revision"],"additionalProperties":false},"BuildSettingsRequest":{"type":"object","properties":{"schemaVersion":{"const":1},"revision":{"type":"string","minLength":1},"settingsRevision":{"type":"string","pattern":"^[a-f0-9]{64}$"},"settings":{"$ref":"#/definitions/BuildSettings"}},"required":["schemaVersion","revision","settingsRevision","settings"],"additionalProperties":false},"ProjectSummary":{"type":"object","properties":{"id":{"type":"string","pattern":"^[a-f0-9]{32}$"},"name":{"type":"string"},"updatedAt":{"type":"string"},"parts":{"type":"integer","minimum":0},"head":{"anyOf":[{"type":"string","pattern":"^[a-f0-9]{32}$"},{"type":"null"}]}},"required":["id","name","updatedAt","parts","head"],"additionalProperties":false},"ProjectCatalog":{"type":"object","properties":{"schemaVersion":{"const":1},"projects":{"type":"array","items":{"$ref":"#/definitions/ProjectSummary"}}},"required":["schemaVersion","projects"],"additionalProperties":false},"ProjectCreateRequest":{"type":"object","properties":{"schemaVersion":{"const":1},"kind":{"enum":["psd","archive"]},"name":{"type":"string","minLength":1,"maxLength":128,"pattern":"\\S"},"data":{"type":"string","minLength":1,"maxLength":178956972}},"required":["schemaVersion","kind","name","data"],"additionalProperties":false},"ProjectCatalogRequest":{"oneOf":[{"type":"object","properties":{"schemaVersion":{"const":1},"operation":{"const":"list"}},"required":["schemaVersion","operation"],"additionalProperties":false},{"type":"object","properties":{"schemaVersion":{"const":1},"operation":{"const":"create"},"input":{"$ref":"#/definitions/ProjectCreateRequest"}},"required":["schemaVersion","operation","input"],"additionalProperties":false}]},"ProjectIssue":{"type":"object","properties":{"location":{"type":"string"},"name":{"type":"string"},"reasons":{"type":"array","items":{"type":"string"}}},"required":["location","name","reasons"],"additionalProperties":false},"ProjectCreateResult":{"type":"object","properties":{"schemaVersion":{"const":1},"status":{"enum":["ok","unsupported"]},"project":{"anyOf":[{"$ref":"#/definitions/ProjectSummary"},{"type":"null"}]},"issues":{"type":"array","items":{"$ref":"#/definitions/ProjectIssue"}}},"required":["schemaVersion","status","project","issues"],"additionalProperties":false},"ProjectRevision":{"type":"object","properties":{"id":{"type":"string","pattern":"^[a-f0-9]{32}$"},"parent":{"anyOf":[{"type":"string","pattern":"^[a-f0-9]{32}$"},{"type":"null"}]},"createdAt":{"type":"string"},"message":{"type":"string"}},"required":["id","parent","createdAt","message"],"additionalProperties":false},"ProjectRevisions":{"type":"object","properties":{"schemaVersion":{"const":1},"head":{"type":"string","pattern":"^[a-f0-9]{32}$"},"revisions":{"type":"array","items":{"$ref":"#/definitions/ProjectRevision"}}},"required":["schemaVersion","head","revisions"],"additionalProperties":false},"ProjectSaveRequest":{"type":"object","properties":{"schemaVersion":{"const":1},"revision":{"type":"string","minLength":1},"settingsRevision":{"type":"string","pattern":"^[a-f0-9]{64}$"},"head":{"type":"string","pattern":"^[a-f0-9]{32}$"},"message":{"type":"string","maxLength":1000},"overlayRevision":{"type":"string","pattern":"^[a-f0-9]{64}$"}},"required":["schemaVersion","revision","settingsRevision","head","message"],"additionalProperties":false},"ProjectRestoreRequest":{"type":"object","properties":{"schemaVersion":{"const":1},"revision":{"type":"string","minLength":1},"settingsRevision":{"type":"string","pattern":"^[a-f0-9]{64}$"},"head":{"type":"string","pattern":"^[a-f0-9]{32}$"},"id":{"type":"string","pattern":"^[a-f0-9]{32}$"},"overlayRevision":{"type":"string","pattern":"^[a-f0-9]{64}$"}},"required":["schemaVersion","revision","settingsRevision","head","id"],"additionalProperties":false},"ProjectDownload":{"type":"object","properties":{"schemaVersion":{"const":1},"url":{"type":"string"},"filename":{"type":"string"},"files":{"type":"integer","minimum":1}},"required":["schemaVersion","url","filename","files"],"additionalProperties":false},"ModelExportRequest":{"type":"object","properties":{"schemaVersion":{"const":1},"revision":{"type":"string","minLength":1},"settingsRevision":{"type":"string","pattern":"^[a-f0-9]{64}$"},"overlayRevision":{"type":"string","pattern":"^[a-f0-9]{64}$"},"target":{"enum":["playable","editor"]},"exportMotions":{"type":"boolean"},"generatePhysics":{"type":"boolean"}},"required":["schemaVersion","revision","settingsRevision","overlayRevision","target","exportMotions","generatePhysics"],"additionalProperties":false},"ModelExportFile":{"type":"object","properties":{"name":{"type":"string"},"bytes":{"type":"integer","minimum":0},"sha256":{"type":"string","pattern":"^[a-f0-9]{64}$"}},"required":["name","bytes","sha256"],"additionalProperties":false},"ModelExportResult":{"type":"object","properties":{"schemaVersion":{"const":1},"target":{"enum":["playable","editor"]},"url":{"type":"string"},"filename":{"type":"string"},"files":{"type":"array","items":{"$ref":"#/definitions/ModelExportFile"}},"warnings":{"type":"array","items":{"type":"string"}},"cacheId":{"type":"string","pattern":"^[a-f0-9]{32}$"},"reused":{"type":"boolean"},"buildSettings":{"$ref":"#/definitions/BuildSettings"},"physics":{"type":"boolean"},"motions":{"type":"integer","minimum":0},"modelSha256":{"type":"string","pattern":"^[a-f0-9]{64}$"},"modelInputSignature":{"type":"string","pattern":"^[a-f0-9]{64}$"},"overlayRevision":{"type":"string","pattern":"^[a-f0-9]{64}$"}},"required":["schemaVersion","target","url","filename","files","warnings","cacheId","reused","buildSettings","physics","motions","modelSha256","modelInputSignature","overlayRevision"],"additionalProperties":false}}} as const;
