"use strict";
(() => {
  // src/constants.ts
  var MIN_MAX_VOXELS = 1e3;
  var MAX_MAX_VOXELS = 1e5;
  var PERFORMANCE_WARNING_VOXELS = 8e3;
  var DEFAULT_PIXEL_BATCH_SIZE = 256;
  var SUPPORTED_IMAGE_MIME_TYPES = [
    "image/png",
    "image/jpeg",
    "image/webp"
  ];

  // src/domain/validation.ts
  var ModelValidationError = class extends Error {
    constructor(message) {
      super(message);
      this.name = "ModelValidationError";
    }
  };
  function validatePixelImage(image) {
    if (!Number.isSafeInteger(image.width) || image.width < 1 || !Number.isSafeInteger(image.height) || image.height < 1) {
      throw new ModelValidationError("Image width and height must be positive integers.");
    }
    const pixelCount = image.width * image.height;
    if (!Number.isSafeInteger(pixelCount * 4) || image.data.length !== pixelCount * 4) {
      throw new ModelValidationError("Image RGBA data length does not match its dimensions.");
    }
  }
  function validatePlannerOptions(options) {
    if (options.processingMode !== "row" && options.processingMode !== "pixel") {
      throw new ModelValidationError("Processing mode must be row or pixel.");
    }
    if (!Number.isFinite(options.voxelSize) || options.voxelSize <= 0) {
      throw new ModelValidationError("Voxel size must be greater than zero.");
    }
    validateAlphaThreshold(options.alphaThreshold);
    if (typeof options.includeTransparent !== "boolean" || typeof options.centerModel !== "boolean") {
      throw new ModelValidationError("Transparency and centering settings must be boolean.");
    }
  }
  function validateAlphaThreshold(alphaThreshold) {
    if (!Number.isInteger(alphaThreshold) || alphaThreshold < 0 || alphaThreshold > 255) {
      throw new ModelValidationError("Alpha threshold must be an integer from 0 to 255.");
    }
  }
  function validateMaxVoxels(maxVoxels) {
    if (!Number.isInteger(maxVoxels) || maxVoxels < MIN_MAX_VOXELS || maxVoxels > MAX_MAX_VOXELS) {
      throw new ModelValidationError(
        `Maximum Cube count must be between ${MIN_MAX_VOXELS} and ${MAX_MAX_VOXELS}.`
      );
    }
  }
  function getVoxelLimitStatus(voxelCount, maxVoxels) {
    validateMaxVoxels(maxVoxels);
    if (!Number.isSafeInteger(voxelCount) || voxelCount < 0) {
      throw new ModelValidationError("Cube count must be a nonnegative integer.");
    }
    if (voxelCount > maxVoxels) return "exceeded";
    if (voxelCount > PERFORMANCE_WARNING_VOXELS) return "warning";
    return "ok";
  }

  // src/domain/model_planner.ts
  var ROW_BATCH_MAX_ROWS = 256;
  var ROW_BATCH_MAX_PIXELS = 2048;
  function nextUIFrame() {
    return new Promise((resolve) => globalThis.setTimeout(resolve, 0));
  }
  function countImagePixels(image, alphaThreshold, includeTransparent) {
    validatePixelImage(image);
    validateAlphaThreshold(alphaThreshold);
    const totalPixels = image.width * image.height;
    let visiblePixels = 0;
    let eligiblePixels = 0;
    for (let index = 3; index < image.data.length; index += 4) {
      const alpha = image.data[index] ?? 0;
      if (alpha > 0) visiblePixels += 1;
      if (alpha > alphaThreshold) eligiblePixels += 1;
    }
    return {
      totalPixels,
      visiblePixels,
      eligiblePixels,
      voxelCount: includeTransparent ? totalPixels : eligiblePixels
    };
  }
  async function planModel(image, options, task = {}) {
    validatePixelImage(image);
    validatePlannerOptions(options);
    const batchSize = task.pixelBatchSize ?? DEFAULT_PIXEL_BATCH_SIZE;
    if (!Number.isInteger(batchSize) || batchSize < 1) {
      throw new ModelValidationError("Pixel batch size must be a positive integer.");
    }
    task.token?.throwIfCancelled();
    const totalPixels = image.width * image.height;
    const voxels = [];
    const yieldToUI = task.yieldToUI ?? nextUIFrame;
    let processedPixels = 0;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let rowsSinceYield = 0;
    let pixelsAtLastRowYield = 0;
    for (let sourceY = 0; sourceY < image.height; sourceY += 1) {
      task.token?.throwIfCancelled();
      for (let sourceX = 0; sourceX < image.width; sourceX += 1) {
        const offset = (sourceY * image.width + sourceX) * 4;
        const alpha = image.data[offset + 3] ?? 0;
        if (options.includeTransparent || alpha > options.alphaThreshold) {
          const x = sourceX * options.voxelSize;
          const y = (image.height - 1 - sourceY) * options.voxelSize;
          voxels.push({
            x,
            y,
            z: 0,
            sourceX,
            sourceY,
            rgba: {
              r: image.data[offset] ?? 0,
              g: image.data[offset + 1] ?? 0,
              b: image.data[offset + 2] ?? 0,
              a: alpha
            }
          });
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x + options.voxelSize);
          maxY = Math.max(maxY, y + options.voxelSize);
        }
        processedPixels += 1;
        if (options.processingMode === "pixel" && processedPixels % batchSize === 0) {
          task.onProgress?.(processedPixels, totalPixels);
          await yieldToUI();
          task.token?.throwIfCancelled();
        }
      }
      if (options.processingMode === "row") {
        rowsSinceYield += 1;
        if (rowsSinceYield >= ROW_BATCH_MAX_ROWS || processedPixels - pixelsAtLastRowYield >= ROW_BATCH_MAX_PIXELS || sourceY === image.height - 1) {
          task.onProgress?.(processedPixels, totalPixels);
          await yieldToUI();
          task.token?.throwIfCancelled();
          rowsSinceYield = 0;
          pixelsAtLastRowYield = processedPixels;
        }
      }
    }
    if (options.processingMode === "pixel" && processedPixels % batchSize !== 0) {
      task.onProgress?.(processedPixels, totalPixels);
    }
    task.token?.throwIfCancelled();
    const bounds = voxels.length === 0 ? { min: [0, 0, 0], max: [0, 0, 0], size: [0, 0, 0] } : {
      min: [minX, minY, 0],
      max: [maxX, maxY, options.voxelSize],
      size: [maxX - minX, maxY - minY, options.voxelSize]
    };
    if (options.centerModel && voxels.length > 0) {
      const offsetX = -(minX + maxX) / 2;
      const offsetY = -(minY + maxY) / 2;
      const offsetZ = -options.voxelSize / 2;
      for (const voxel of voxels) {
        voxel.x += offsetX;
        voxel.y += offsetY;
        voxel.z += offsetZ;
      }
      bounds.min = [minX + offsetX, minY + offsetY, offsetZ];
      bounds.max = [maxX + offsetX, maxY + offsetY, options.voxelSize + offsetZ];
    }
    return {
      width: image.width,
      height: image.height,
      voxelSize: options.voxelSize,
      voxelCount: voxels.length,
      bounds,
      voxels
    };
  }

  // src/domain/naming.ts
  function removeExtension(fileName) {
    const parts = fileName.split(/[/\\]/);
    const basename = parts[parts.length - 1] ?? "";
    const dot = basename.lastIndexOf(".");
    return dot > 0 ? basename.slice(0, dot) : basename;
  }
  function normalizeGroupBase(fileName) {
    return removeExtension(fileName).trim().replace(/[\\/:<>?"|]+/g, "_").replace(/\s+/g, "_").replace(/^_+|_+$/g, "") || "texture";
  }
  function defaultGroupName(fileName) {
    return `${normalizeGroupBase(fileName)}_texture_model`;
  }
  function uniqueGroupName(preferredName, existingNames) {
    const base = preferredName.trim() || "texture_model";
    const used = new Set(Array.from(existingNames, (name) => name.toLowerCase()));
    if (!used.has(base.toLowerCase())) return base;
    for (let suffix = 2; ; suffix += 1) {
      const candidate = `${base}_${suffix}`;
      if (!used.has(candidate.toLowerCase())) return candidate;
    }
  }
  function uniqueTextureName(fileName, existingNames) {
    const parts = fileName.split(/[/\\]/);
    const name = parts[parts.length - 1]?.trim() || "texture.png";
    const dot = name.lastIndexOf(".");
    const base = dot > 0 ? name.slice(0, dot) : name;
    const extension = dot > 0 ? name.slice(dot) : "";
    const used = new Set(Array.from(existingNames, (existing) => existing.toLowerCase()));
    if (!used.has(name.toLowerCase())) return name;
    for (let suffix = 2; ; suffix += 1) {
      const candidate = `${base}_${suffix}${extension}`;
      if (!used.has(candidate.toLowerCase())) return candidate;
    }
  }

  // src/domain/pixel_to_uv.ts
  function pixelToUVRect(x, y, imageWidth, imageHeight, uvWidth, uvHeight) {
    if (!Number.isInteger(imageWidth) || imageWidth < 1 || !Number.isInteger(imageHeight) || imageHeight < 1 || !Number.isFinite(uvWidth) || uvWidth <= 0 || !Number.isFinite(uvHeight) || uvHeight <= 0 || !Number.isInteger(x) || x < 0 || x >= imageWidth || !Number.isInteger(y) || y < 0 || y >= imageHeight) {
      throw new ModelValidationError("Pixel or UV dimensions are invalid.");
    }
    return [
      x / imageWidth * uvWidth,
      y / imageHeight * uvHeight,
      (x + 1) / imageWidth * uvWidth,
      (y + 1) / imageHeight * uvHeight
    ];
  }

  // src/blockbench/texture_writer.ts
  function writeTexture(image, track) {
    const name = uniqueTextureName(image.fileName, Texture.all.map((texture2) => texture2.name));
    const texture = new Texture({ name });
    track(texture);
    texture.uv_width = image.width;
    texture.uv_height = image.height;
    texture.fromDataURL(image.dataURL);
    return texture.add(false);
  }

  // src/blockbench/model_writer.ts
  var FACE_DIRECTIONS = [
    "north",
    "south",
    "east",
    "west",
    "up",
    "down"
  ];
  function sameNumber(actual, expected) {
    return Number.isFinite(actual) && Math.abs(actual - expected) <= 1e-8 * Math.max(1, Math.abs(expected));
  }
  function validatePlan(image, plan, options) {
    validatePixelImage(image);
    validatePlannerOptions(options);
    validateMaxVoxels(options.maxVoxels);
    if (typeof image.dataURL !== "string" || !image.dataURL.startsWith("data:image/")) {
      throw new ModelValidationError("The decoded image has no usable Data URL.");
    }
    if (plan.width !== image.width || plan.height !== image.height || plan.voxelSize !== options.voxelSize || !Number.isSafeInteger(plan.voxelCount) || plan.voxelCount !== plan.voxels.length) {
      throw new ModelValidationError("Preview no longer matches the chosen image or settings.");
    }
    const expectedCount = countImagePixels(
      image,
      options.alphaThreshold,
      options.includeTransparent
    ).voxelCount;
    if (plan.voxelCount !== expectedCount) {
      throw new ModelValidationError("Preview no longer matches the transparency settings.");
    }
    if (plan.voxelCount > options.maxVoxels) {
      throw new ModelValidationError(
        `The model needs ${plan.voxelCount} Cubes, above the limit of ${options.maxVoxels}.`
      );
    }
    const size = options.voxelSize;
    let minSourceX = Infinity;
    let minSourceY = Infinity;
    let maxSourceX = -Infinity;
    let maxSourceY = -Infinity;
    let previousSourceIndex = -1;
    for (const voxel of plan.voxels) {
      const { sourceX, sourceY } = voxel;
      const sourceIndex = sourceY * image.width + sourceX;
      const pixelIndex = sourceIndex * 4;
      if (!Number.isInteger(sourceX) || !Number.isInteger(sourceY) || sourceX < 0 || sourceX >= image.width || sourceY < 0 || sourceY >= image.height || sourceIndex <= previousSourceIndex || voxel.rgba.r !== image.data[pixelIndex] || voxel.rgba.g !== image.data[pixelIndex + 1] || voxel.rgba.b !== image.data[pixelIndex + 2] || voxel.rgba.a !== image.data[pixelIndex + 3] || !options.includeTransparent && voxel.rgba.a <= options.alphaThreshold) {
        throw new ModelValidationError("Preview pixel data is stale or invalid.");
      }
      previousSourceIndex = sourceIndex;
      minSourceX = Math.min(minSourceX, sourceX);
      maxSourceX = Math.max(maxSourceX, sourceX);
      minSourceY = Math.min(minSourceY, sourceY);
      maxSourceY = Math.max(maxSourceY, sourceY);
    }
    if (plan.voxelCount === 0) {
      if ([...plan.bounds.min, ...plan.bounds.max, ...plan.bounds.size].some((dimension) => !sameNumber(dimension, 0))) {
        throw new ModelValidationError("Empty preview bounds are invalid.");
      }
      return;
    }
    const minX = minSourceX * size;
    const maxX = (maxSourceX + 1) * size;
    const minY = (image.height - 1 - maxSourceY) * size;
    const maxY = (image.height - minSourceY) * size;
    const offsetX = options.centerModel ? -(minX + maxX) / 2 : 0;
    const offsetY = options.centerModel ? -(minY + maxY) / 2 : 0;
    const offsetZ = options.centerModel ? -size / 2 : 0;
    for (const voxel of plan.voxels) {
      if (!sameNumber(voxel.x, voxel.sourceX * size + offsetX) || !sameNumber(voxel.y, (image.height - 1 - voxel.sourceY) * size + offsetY) || !sameNumber(voxel.z, offsetZ)) {
        throw new ModelValidationError("Preview geometry is stale or invalid.");
      }
    }
    const expectedMin = [minX + offsetX, minY + offsetY, offsetZ];
    const expectedMax = [maxX + offsetX, maxY + offsetY, size + offsetZ];
    for (let axis = 0; axis < 3; axis += 1) {
      if (!sameNumber(plan.bounds.min[axis] ?? NaN, expectedMin[axis] ?? NaN) || !sameNumber(plan.bounds.max[axis] ?? NaN, expectedMax[axis] ?? NaN) || !sameNumber(
        plan.bounds.size[axis] ?? NaN,
        (expectedMax[axis] ?? NaN) - (expectedMin[axis] ?? NaN)
      )) {
        throw new ModelValidationError("Preview bounds are stale or invalid.");
      }
    }
  }
  function preflightFormat(image) {
    if (typeof Project === "undefined" || !Project || typeof Format === "undefined" || !Format) {
      throw new ModelValidationError("Open a Blockbench model project before generating.");
    }
    if (typeof Cube === "undefined" || typeof Group === "undefined" || typeof Texture === "undefined" || typeof Undo === "undefined" || typeof Canvas === "undefined" || !Format.edit_mode || Format.image_editor) {
      throw new ModelValidationError("The current project format does not support Cube editing.");
    }
    if (Format.box_uv && !Format.optional_box_uv || Format.single_texture || Format.per_group_texture) {
      throw new ModelValidationError(
        "The current project format cannot use an independent texture on every Cube face."
      );
    }
    if (!Format.per_texture_uv_size && (!Number.isFinite(Project.texture_width) || Project.texture_width <= 0 || !Number.isFinite(Project.texture_height) || Project.texture_height <= 0)) {
      throw new ModelValidationError("The current project UV dimensions are invalid.");
    }
    const uvWidth = Format.per_texture_uv_size ? image.width : Project.texture_width;
    const uvHeight = Format.per_texture_uv_size ? image.height : Project.texture_height;
    if (!Number.isFinite(uvWidth) || uvWidth <= 0 || !Number.isFinite(uvHeight) || uvHeight <= 0) {
      throw new ModelValidationError("The current project has invalid UV dimensions.");
    }
  }
  function cubeFaces(uv, texture) {
    const faces = {};
    for (const direction of FACE_DIRECTIONS) {
      faces[direction] = { enabled: true, texture: texture.uuid, uv: [...uv] };
    }
    return faces;
  }
  function makeCube(voxel, size, texture, image, uvWidth, uvHeight) {
    const uv = pixelToUVRect(
      voxel.sourceX,
      voxel.sourceY,
      image.width,
      image.height,
      uvWidth,
      uvHeight
    );
    return new Cube({
      name: `px_${voxel.sourceX}_${voxel.sourceY}`,
      from: [voxel.x, voxel.y, voxel.z],
      to: [voxel.x + size, voxel.y + size, voxel.z + size],
      box_uv: false,
      autouv: 0,
      faces: cubeFaces(uv, texture)
    });
  }
  function writeModel(image, plan, options) {
    validatePlan(image, plan, options);
    preflightFormat(image);
    if (typeof options.groupName !== "string") {
      throw new ModelValidationError("Group name must be text.");
    }
    const preferredName = options.groupName.trim() || defaultGroupName(image.fileName);
    const groupName = uniqueGroupName(preferredName, Group.all.map((group) => group.name));
    const aspects = {
      outliner: true,
      elements: [],
      groups: [],
      textures: [],
      selected_texture: true
    };
    Undo.initEdit(aspects);
    try {
      const texture = writeTexture(image, (created) => aspects.textures?.push(created));
      const uvWidth = texture.getUVWidth();
      const uvHeight = texture.getUVHeight();
      const group = new Group({ name: groupName });
      aspects.groups?.push(group);
      group.addTo("root").init();
      for (const voxel of plan.voxels) {
        const cube = makeCube(voxel, plan.voxelSize, texture, image, uvWidth, uvHeight);
        aspects.elements?.push(cube);
        cube.addTo(group).init();
      }
      Undo.finishEdit("Generate Texture Model", aspects);
    } catch (error) {
      Undo.cancelEdit(true);
      throw error;
    }
  }

  // src/domain/cancellation.ts
  var TaskCancelledError = class extends Error {
    constructor() {
      super("Task cancelled");
      this.name = "TaskCancelledError";
    }
  };
  var CancellationToken = class {
    constructor() {
      this.cancelledValue = false;
      this.listeners = /* @__PURE__ */ new Set();
    }
    get cancelled() {
      return this.cancelledValue;
    }
    cancel() {
      if (this.cancelledValue) return;
      this.cancelledValue = true;
      for (const listener of this.listeners) listener();
      this.listeners.clear();
    }
    throwIfCancelled() {
      if (this.cancelledValue) throw new TaskCancelledError();
    }
    onCancel(listener) {
      if (this.cancelledValue) {
        listener();
        return () => void 0;
      }
      this.listeners.add(listener);
      return () => this.listeners.delete(listener);
    }
  };

  // src/domain/alpha_histogram.ts
  function buildAlphaHistogram(image) {
    validatePixelImage(image);
    const bins = new Uint32Array(256);
    for (let index = 3; index < image.data.length; index += 4) {
      const alpha = image.data[index] ?? 0;
      bins[alpha] = (bins[alpha] ?? 0) + 1;
    }
    const totalPixels = image.width * image.height;
    return { bins, totalPixels, visiblePixels: totalPixels - (bins[0] ?? 0) };
  }
  function countFromAlphaHistogram(histogram, alphaThreshold, includeTransparent) {
    validateAlphaThreshold(alphaThreshold);
    let eligiblePixels = 0;
    for (let alpha = alphaThreshold + 1; alpha < 256; alpha += 1) {
      eligiblePixels += histogram.bins[alpha] ?? 0;
    }
    return {
      totalPixels: histogram.totalPixels,
      visiblePixels: histogram.visiblePixels,
      eligiblePixels,
      voxelCount: includeTransparent ? histogram.totalPixels : eligiblePixels
    };
  }

  // src/domain/image_decoder.ts
  function supportedMimeType(file) {
    const declared = file.type.toLowerCase();
    const parts = file.name.split(".");
    const extension = parts[parts.length - 1]?.toLowerCase();
    const inferred = extension === "png" ? "image/png" : extension === "jpg" || extension === "jpeg" ? "image/jpeg" : extension === "webp" ? "image/webp" : "";
    const mimeType = declared || inferred;
    if (!SUPPORTED_IMAGE_MIME_TYPES.some((supported) => supported === mimeType)) {
      throw new ModelValidationError("Choose a PNG, JPEG, or WebP image.");
    }
    return mimeType;
  }
  function readAsDataURL(file, token) {
    token?.throwIfCancelled();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      let finished = false;
      let unsubscribe = () => void 0;
      const finish = (result) => {
        if (finished) return;
        finished = true;
        unsubscribe();
        reader.onload = null;
        reader.onerror = null;
        reader.onabort = null;
        if (typeof result === "string") resolve(result);
        else reject(result);
      };
      reader.onload = () => {
        if (typeof reader.result === "string") finish(reader.result);
        else finish(new ModelValidationError("Could not read the image file."));
      };
      reader.onerror = () => finish(new ModelValidationError("Could not read the image file."));
      reader.onabort = () => finish(new TaskCancelledError());
      unsubscribe = token?.onCancel(() => {
        reader.abort();
        finish(new TaskCancelledError());
      }) ?? unsubscribe;
      if (token?.cancelled) return;
      try {
        reader.readAsDataURL(file);
      } catch {
        finish(new ModelValidationError("Could not read the image file."));
      }
    });
  }
  function loadImage(dataURL, token) {
    token?.throwIfCancelled();
    return new Promise((resolve, reject) => {
      const image = new Image();
      let finished = false;
      let unsubscribe = () => void 0;
      const finish = (error) => {
        if (finished) return;
        finished = true;
        unsubscribe();
        image.onload = null;
        image.onerror = null;
        if (error) reject(error);
        else resolve(image);
      };
      image.onload = () => finish();
      image.onerror = () => finish(new ModelValidationError("Could not decode the image."));
      unsubscribe = token?.onCancel(() => {
        image.src = "";
        finish(new TaskCancelledError());
      }) ?? unsubscribe;
      if (token?.cancelled) return;
      image.src = dataURL;
    });
  }
  async function decodeImageFile(file, token) {
    const mimeType = supportedMimeType(file);
    const dataURL = await readAsDataURL(file, token);
    const image = await loadImage(dataURL, token);
    token?.throwIfCancelled();
    if (!Number.isSafeInteger(image.naturalWidth) || image.naturalWidth < 1 || !Number.isSafeInteger(image.naturalHeight) || image.naturalHeight < 1) {
      throw new ModelValidationError("The image has invalid dimensions.");
    }
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new ModelValidationError("Canvas 2D is unavailable.");
    context.drawImage(image, 0, 0);
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    token?.throwIfCancelled();
    const pixels = {
      width: imageData.width,
      height: imageData.height,
      data: imageData.data
    };
    return {
      ...pixels,
      fileName: file.name,
      dataURL,
      mimeType,
      imageData,
      visiblePixelCount: countImagePixels(pixels, 0, false).visiblePixels
    };
  }

  // src/preview/preview_renderer.ts
  var BACKGROUND = "#1b1d25";
  var DEFAULT_YAW = Math.PI / 4;
  var DEFAULT_PITCH = Math.PI / 6;
  var MIN_PITCH = -Math.PI / 2 + 0.08;
  var MAX_PITCH = Math.PI / 2 - 0.08;
  var PreviewRenderer = class {
    constructor(canvas) {
      this.hostThree = globalThis.THREE;
      this.renderer = null;
      this.scene = null;
      this.camera = null;
      this.mesh = null;
      this.geometry = null;
      this.material = null;
      this.plan = null;
      this.webglUnavailable = false;
      this.disposed = false;
      this.yaw = DEFAULT_YAW;
      this.pitch = DEFAULT_PITCH;
      this.zoom = 1;
      this.width = 1;
      this.height = 1;
      this.pixelRatio = 1;
      this.pointerId = null;
      this.lastPointerX = 0;
      this.lastPointerY = 0;
      this.frame = 0;
      this.onPointerDown = (event) => {
        if (this.disposed || event.button !== 0) return;
        this.pointerId = event.pointerId;
        this.lastPointerX = event.clientX;
        this.lastPointerY = event.clientY;
        this.canvas.setPointerCapture(event.pointerId);
      };
      this.onPointerMove = (event) => {
        if (this.pointerId !== event.pointerId) return;
        const dx = event.clientX - this.lastPointerX;
        const dy = event.clientY - this.lastPointerY;
        this.lastPointerX = event.clientX;
        this.lastPointerY = event.clientY;
        this.yaw += dx * 8e-3;
        this.pitch = Math.min(MAX_PITCH, Math.max(MIN_PITCH, this.pitch + dy * 8e-3));
        this.requestFrame();
      };
      this.onPointerEnd = (event) => {
        if (this.pointerId !== event.pointerId) return;
        if (this.canvas.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId);
        this.pointerId = null;
      };
      this.onWheel = (event) => {
        if (this.disposed) return;
        event.preventDefault();
        this.zoom = Math.min(12, Math.max(0.2, this.zoom * Math.exp(-event.deltaY * 1e-3)));
        this.requestFrame();
      };
      this.onContextLost = (event) => {
        event.preventDefault();
        this.releaseWebGL();
        this.webglUnavailable = true;
        this.requestFrame();
      };
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Texture Model preview requires a 2D canvas context.");
      this.canvas = canvas;
      this.context = context;
      this.webglCanvas = document.createElement("canvas");
      this.canvas.addEventListener("pointerdown", this.onPointerDown);
      this.canvas.addEventListener("pointermove", this.onPointerMove);
      this.canvas.addEventListener("pointerup", this.onPointerEnd);
      this.canvas.addEventListener("pointercancel", this.onPointerEnd);
      this.canvas.addEventListener("wheel", this.onWheel, { passive: false });
      this.webglCanvas.addEventListener("webglcontextlost", this.onContextLost);
      this.resize();
    }
    render(plan) {
      if (this.disposed) return;
      this.plan = plan;
      this.releaseModel();
      if (plan.voxelCount > 0 && this.prepareWebGL()) {
        try {
          this.createModel(plan);
        } catch {
          this.releaseWebGL();
          this.webglUnavailable = true;
        }
      }
      this.drawFrame();
    }
    resize() {
      if (this.disposed) return;
      const width = Math.max(1, Math.round(this.canvas.clientWidth || (this.width > 1 ? this.width : this.canvas.width || 640)));
      const height = Math.max(1, Math.round(this.canvas.clientHeight || (this.height > 1 ? this.height : this.canvas.height || 360)));
      const ratio = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
      this.width = width;
      this.height = height;
      this.pixelRatio = ratio;
      if (this.canvas.width !== Math.round(width * ratio)) this.canvas.width = Math.round(width * ratio);
      if (this.canvas.height !== Math.round(height * ratio)) this.canvas.height = Math.round(height * ratio);
      this.context.setTransform(ratio, 0, 0, ratio, 0, 0);
      this.renderer?.setPixelRatio(ratio);
      this.renderer?.setSize(width, height, false);
      this.requestFrame();
    }
    dispose() {
      if (this.disposed) return;
      this.disposed = true;
      if (this.frame) cancelAnimationFrame(this.frame);
      this.frame = 0;
      this.canvas.removeEventListener("pointerdown", this.onPointerDown);
      this.canvas.removeEventListener("pointermove", this.onPointerMove);
      this.canvas.removeEventListener("pointerup", this.onPointerEnd);
      this.canvas.removeEventListener("pointercancel", this.onPointerEnd);
      this.canvas.removeEventListener("wheel", this.onWheel);
      this.webglCanvas.removeEventListener("webglcontextlost", this.onContextLost);
      if (this.pointerId !== null && this.canvas.hasPointerCapture(this.pointerId)) {
        this.canvas.releasePointerCapture(this.pointerId);
      }
      this.pointerId = null;
      this.releaseWebGL();
      this.plan = null;
    }
    prepareWebGL() {
      if (this.webglUnavailable) return false;
      if (this.renderer) return true;
      const three = this.hostThree;
      if (!three?.InstancedMesh) {
        this.webglUnavailable = true;
        return false;
      }
      try {
        this.renderer = new three.WebGLRenderer({
          canvas: this.webglCanvas,
          antialias: true,
          alpha: false,
          preserveDrawingBuffer: true
        });
        this.renderer.setPixelRatio(this.pixelRatio);
        this.renderer.setSize(this.width, this.height, false);
        this.renderer.setClearColor(BACKGROUND, 1);
        this.scene = new three.Scene();
        this.scene.add(new three.AmbientLight(16777215, 0.76));
        const light = new three.DirectionalLight(16777215, 0.54);
        light.position.set(1, 2, 3);
        this.scene.add(light);
        this.camera = new three.OrthographicCamera(-1, 1, 1, -1, 0.1, 1e3);
        return true;
      } catch {
        this.releaseWebGL();
        this.webglUnavailable = true;
        return false;
      }
    }
    createModel(plan) {
      const three = this.hostThree;
      if (!this.scene || !three) return;
      const count = plan.voxels.length;
      const size = plan.voxelSize;
      const geometry = new three.BoxGeometry(size, size, size);
      this.geometry = geometry;
      const alpha = new Float32Array(count);
      geometry.setAttribute("instanceAlpha", new three.InstancedBufferAttribute(alpha, 1));
      const material = new three.MeshLambertMaterial({
        color: 16777215,
        transparent: true,
        depthWrite: true
      });
      this.material = material;
      material.onBeforeCompile = (shader) => {
        const vertexMarker = "#include <begin_vertex>";
        const fragmentMarker = "#include <output_fragment>";
        if (!shader.vertexShader.includes(vertexMarker) || !shader.fragmentShader.includes(fragmentMarker)) {
          throw new Error("The host Three.js shader does not support instance alpha.");
        }
        shader.vertexShader = `attribute float instanceAlpha;
varying float vInstanceAlpha;
${shader.vertexShader}`.replace(vertexMarker, `${vertexMarker}
vInstanceAlpha = instanceAlpha;`);
        shader.fragmentShader = `varying float vInstanceAlpha;
${shader.fragmentShader}`.replace(fragmentMarker, `diffuseColor.a *= vInstanceAlpha;
${fragmentMarker}`);
      };
      const mesh = new three.InstancedMesh(geometry, material, count);
      const matrix = new three.Matrix4();
      const color = new three.Color();
      for (let index = 0; index < count; index += 1) {
        const voxel = plan.voxels[index];
        if (!voxel) continue;
        matrix.makeTranslation(voxel.x + size / 2, voxel.y + size / 2, voxel.z + size / 2);
        mesh.setMatrixAt(index, matrix);
        color.setRGB(voxel.rgba.r / 255, voxel.rgba.g / 255, voxel.rgba.b / 255);
        mesh.setColorAt(index, color);
        alpha[index] = voxel.rgba.a / 255;
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      geometry.getAttribute("instanceAlpha").needsUpdate = true;
      this.mesh = mesh;
      this.scene.add(mesh);
    }
    releaseModel() {
      if (this.mesh) {
        this.scene?.remove(this.mesh);
        this.mesh.dispose();
      }
      this.mesh = null;
      this.geometry?.dispose();
      this.material?.dispose();
      this.geometry = null;
      this.material = null;
    }
    releaseWebGL() {
      this.releaseModel();
      const renderer = this.renderer;
      this.renderer = null;
      if (renderer) {
        try {
          renderer.dispose();
          renderer.forceContextLoss();
        } catch {
        }
      }
      this.scene = null;
      this.camera = null;
      this.webglCanvas.width = 0;
      this.webglCanvas.height = 0;
    }
    drawFrame() {
      if (this.disposed) return;
      this.frame = 0;
      this.context.fillStyle = BACKGROUND;
      this.context.fillRect(0, 0, this.width, this.height);
      if (!this.plan || this.plan.voxelCount === 0) {
        this.drawEmptyMessage();
        return;
      }
      if (this.renderer && this.scene && this.camera && this.mesh) {
        try {
          this.configureCamera(this.plan);
          this.renderer.render(this.scene, this.camera);
          this.context.drawImage(this.webglCanvas, 0, 0, this.width, this.height);
          return;
        } catch {
          this.releaseWebGL();
          this.webglUnavailable = true;
        }
      }
      this.drawCanvasFallback(this.plan);
    }
    configureCamera(plan) {
      if (!this.camera) return;
      const size = plan.bounds.size;
      const center = plan.bounds.min.map((value, index) => (value + (plan.bounds.max[index] ?? value)) / 2);
      const diameter = Math.max(1, Math.hypot(size[0], size[1], size[2]));
      const halfHeight = diameter * 0.7 / Math.min(1, this.width / this.height) / this.zoom;
      const halfWidth = halfHeight * this.width / this.height;
      this.camera.left = -halfWidth;
      this.camera.right = halfWidth;
      this.camera.top = halfHeight;
      this.camera.bottom = -halfHeight;
      this.camera.near = 0.1;
      this.camera.far = diameter * 8 + 100;
      const distance = diameter * 3 + 10;
      this.camera.position.set(
        (center[0] ?? 0) + Math.sin(this.yaw) * Math.cos(this.pitch) * distance,
        (center[1] ?? 0) + Math.sin(this.pitch) * distance,
        (center[2] ?? 0) + Math.cos(this.yaw) * Math.cos(this.pitch) * distance
      );
      this.camera.up.set(0, 1, 0);
      this.camera.lookAt(center[0] ?? 0, center[1] ?? 0, center[2] ?? 0);
      this.camera.updateProjectionMatrix();
    }
    drawEmptyMessage() {
      this.context.fillStyle = "#b9becb";
      this.context.font = "14px sans-serif";
      this.context.textAlign = "center";
      this.context.textBaseline = "middle";
      this.context.fillText(this.plan ? "\u6CA1\u6709\u53EF\u9884\u89C8\u7684 Cube" : "\u9009\u62E9\u7EB9\u7406\u540E\u9884\u89C8", this.width / 2, this.height / 2);
    }
    drawCanvasFallback(plan) {
      const centerX = (plan.bounds.min[0] + plan.bounds.max[0]) / 2;
      const centerY = (plan.bounds.min[1] + plan.bounds.max[1]) / 2;
      const centerZ = (plan.bounds.min[2] + plan.bounds.max[2]) / 2;
      const sinYaw = Math.sin(this.yaw);
      const cosYaw = Math.cos(this.yaw);
      const sinPitch = Math.sin(this.pitch);
      const cosPitch = Math.cos(this.pitch);
      const viewX = sinYaw * cosPitch;
      const viewY = sinPitch;
      const viewZ = cosYaw * cosPitch;
      const diameter = Math.max(1, Math.hypot(...plan.bounds.size));
      const scale = Math.min(this.width, this.height) * 0.7 * this.zoom / diameter;
      const project = (x, y, z) => {
        const dx = x - centerX;
        const dy = y - centerY;
        const dz = z - centerZ;
        return {
          x: this.width / 2 + (cosYaw * dx - sinYaw * dz) * scale,
          y: this.height / 2 - (-sinYaw * sinPitch * dx + cosPitch * dy - cosYaw * sinPitch * dz) * scale
        };
      };
      const sorted = plan.voxels.map((voxel) => ({
        voxel,
        depth: (voxel.x + plan.voxelSize / 2 - centerX) * viewX + (voxel.y + plan.voxelSize / 2 - centerY) * viewY + (voxel.z + plan.voxelSize / 2 - centerZ) * viewZ
      }));
      sorted.sort((a, b) => a.depth - b.depth);
      for (const item of sorted) {
        const voxel = item.voxel;
        if (voxel.rgba.a === 0) continue;
        const faces = [
          { axis: "x", positive: viewX >= 0, shade: 0.74, depth: Math.abs(viewX) },
          { axis: "y", positive: viewY >= 0, shade: viewY >= 0 ? 1 : 0.48, depth: Math.abs(viewY) },
          { axis: "z", positive: viewZ >= 0, shade: 0.85, depth: Math.abs(viewZ) }
        ];
        faces.sort((a, b) => a.depth - b.depth);
        for (const face of faces) this.drawVoxelFace(voxel, face, plan.voxelSize, project);
      }
    }
    drawVoxelFace(voxel, face, size, project) {
      const x0 = voxel.x;
      const y0 = voxel.y;
      const z0 = voxel.z;
      const x1 = x0 + size;
      const y1 = y0 + size;
      const z1 = z0 + size;
      let points;
      if (face.axis === "x") {
        const x = face.positive ? x1 : x0;
        points = [project(x, y0, z0), project(x, y0, z1), project(x, y1, z1), project(x, y1, z0)];
      } else if (face.axis === "y") {
        const y = face.positive ? y1 : y0;
        points = [project(x0, y, z0), project(x1, y, z0), project(x1, y, z1), project(x0, y, z1)];
      } else {
        const z = face.positive ? z1 : z0;
        points = [project(x0, y0, z), project(x1, y0, z), project(x1, y1, z), project(x0, y1, z)];
      }
      const [first, ...rest] = points;
      if (!first) return;
      const color = voxel.rgba;
      this.context.fillStyle = `rgba(${Math.round(color.r * face.shade)}, ${Math.round(color.g * face.shade)}, ${Math.round(color.b * face.shade)}, ${color.a / 255})`;
      this.context.beginPath();
      this.context.moveTo(first.x, first.y);
      for (const point of rest) this.context.lineTo(point.x, point.y);
      this.context.closePath();
      this.context.fill();
    }
    requestFrame() {
      if (this.disposed || this.frame) return;
      this.frame = requestAnimationFrame(() => this.drawFrame());
    }
  };

  // src/ui/generator_dialog.ts
  var markup = [
    '<div class="texture-model-shell"><div class="texture-model-columns">',
    '<div class="texture-model-controls">',
    "<section><h3>\u7EB9\u7406</h3>",
    '<label class="texture-model-file">\u9009\u62E9\u7EB9\u7406 <input data-field="file" type="file" accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"></label>',
    '<span data-output="filename">\u672A\u9009\u62E9\u56FE\u7247</span>',
    '<img data-output="thumbnail" class="texture-model-thumbnail" alt="\u7EB9\u7406\u7F29\u7565\u56FE" hidden></section>',
    "<section><h3>\u751F\u6210\u8BBE\u7F6E</h3>",
    '<label>\u5904\u7406\u65B9\u5F0F <select data-field="processingMode"><option value="row">\u6309\u884C</option><option value="pixel">\u6309\u50CF\u7D20</option></select></label>',
    '<label>Voxel Size <input data-field="voxelSize" type="number" min="0.01" step="0.1" value="1"></label>',
    '<label>Alpha Threshold <input data-field="alphaThreshold" type="number" min="0" max="255" step="1" value="0"></label>',
    '<label class="texture-model-checkbox"><input data-field="includeTransparent" type="checkbox"> \u5305\u542B\u900F\u660E\u50CF\u7D20</label>',
    '<label class="texture-model-checkbox"><input data-field="centerModel" type="checkbox" checked> \u5C45\u4E2D\u6A21\u578B</label>',
    '<label>Group Name <input data-field="groupName" type="text" value="texture_model"></label>',
    "<details><summary>\u9AD8\u7EA7\u8BBE\u7F6E</summary>",
    '<label>\u6700\u5927 Cube \u6570 <input data-field="maxVoxels" type="number" min="1000" max="100000" step="1" value="20000"></label>',
    "<small>\u5927\u91CF Cube \u4F1A\u4E25\u91CD\u5F71\u54CD Blockbench \u6027\u80FD\u3002</small></details></section>",
    '<section class="texture-model-stats"><h3>\u7EDF\u8BA1</h3>',
    '<div>\u56FE\u7247\u5C3A\u5BF8 <strong data-output="dimensions">\u2014</strong></div>',
    '<div>\u603B\u50CF\u7D20\u6570 <strong data-output="totalPixels">\u2014</strong></div>',
    '<div>\u53EF\u89C1\u50CF\u7D20\u6570 <strong data-output="visiblePixels">\u2014</strong></div>',
    '<div>\u9884\u8BA1 Cube \u6570 <strong data-output="voxelCount">\u2014</strong></div>',
    '<div>\u9884\u8BA1\u6A21\u578B\u5C3A\u5BF8 <strong data-output="modelSize">\u2014</strong></div></section>',
    '<p class="texture-model-status" data-output="status" role="status">\u8BF7\u9009\u62E9 PNG\u3001JPEG \u6216 WebP \u56FE\u7247\u3002</p>',
    '<div class="texture-model-actions"><button type="button" data-action="preview" disabled>\u9884\u89C8</button>',
    '<button type="button" data-action="generate" disabled>\u751F\u6210\u5230\u5DE5\u4F5C\u533A</button></div>',
    '</div><div class="texture-model-preview-wrap">',
    '<canvas data-output="preview" class="texture-model-preview" aria-label="\u6A21\u578B\u9884\u89C8"></canvas>',
    "<p>\u62D6\u52A8\u65CB\u8F6C \xB7 \u6EDA\u8F6E\u7F29\u653E</p></div></div></div>"
  ].join("");
  function required(root, selector) {
    const element = root.querySelector(selector);
    if (!element) throw new Error("Generator control is missing: " + selector);
    return element;
  }
  function messageOf(error) {
    return error instanceof Error ? error.message : String(error);
  }
  var GeneratorController = class {
    constructor(dialog, onGenerate) {
      this.dialog = dialog;
      this.onGenerate = onGenerate;
      this.cleanup = [];
      this.revision = 0;
      this.previewRevision = -1;
      this.root = required(dialog.object, ".texture-model-shell");
      this.bind();
      this.updateState();
    }
    field(name) {
      return required(this.root, '[data-field="' + name + '"]');
    }
    output(name) {
      return required(this.root, '[data-output="' + name + '"]');
    }
    listen(target, type, handler) {
      target.addEventListener(type, handler);
      this.cleanup.push(() => target.removeEventListener(type, handler));
    }
    bind() {
      this.listen(this.field("file"), "change", () => {
        void this.selectImage();
      });
      for (const name of [
        "processingMode",
        "voxelSize",
        "alphaThreshold",
        "includeTransparent",
        "centerModel",
        "groupName",
        "maxVoxels"
      ]) {
        const field = this.field(name);
        this.listen(field, "input", () => this.invalidate());
        this.listen(field, "change", () => this.invalidate());
      }
      this.listen(required(this.root, '[data-action="preview"]'), "click", () => {
        void this.preview();
      });
      this.listen(required(this.root, '[data-action="generate"]'), "click", () => {
        this.generate();
      });
    }
    replaceTask() {
      this.token?.cancel();
      this.token = new CancellationToken();
      return this.token;
    }
    invalidate() {
      this.revision += 1;
      this.previewRevision = -1;
      this.plan = void 0;
      this.replaceTask();
      this.renderer?.dispose();
      this.renderer = void 0;
      this.updateState();
    }
    async selectImage() {
      const file = this.field("file").files?.[0];
      this.invalidate();
      this.image = void 0;
      this.alphaHistogram = void 0;
      const thumbnail = this.output("thumbnail");
      thumbnail.hidden = true;
      thumbnail.removeAttribute("src");
      this.output("filename").textContent = file?.name ?? "\u672A\u9009\u62E9\u56FE\u7247";
      this.updateState();
      if (!file) return;
      const token = this.replaceTask();
      const revision = this.revision;
      this.setStatus("\u6B63\u5728\u8BFB\u53D6\u56FE\u7247\u2026");
      try {
        const image = await decodeImageFile(file, token);
        if (token.cancelled || revision !== this.revision) return;
        this.image = image;
        this.alphaHistogram = buildAlphaHistogram(image);
        this.field("groupName").value = defaultGroupName(image.fileName);
        thumbnail.src = image.dataURL;
        thumbnail.hidden = false;
        this.setStatus("\u56FE\u7247\u5DF2\u52A0\u8F7D\u3002\u8BF7\u70B9\u51FB\u9884\u89C8\u3002");
        this.updateState();
      } catch (error) {
        if (!(error instanceof TaskCancelledError)) this.setStatus(messageOf(error), "error");
      }
    }
    options() {
      const options = {
        processingMode: this.field("processingMode").value,
        voxelSize: Number(this.field("voxelSize").value),
        alphaThreshold: Number(this.field("alphaThreshold").value),
        includeTransparent: this.field("includeTransparent").checked,
        centerModel: this.field("centerModel").checked,
        groupName: this.field("groupName").value.trim() || "texture_model",
        maxVoxels: Number(this.field("maxVoxels").value)
      };
      validatePlannerOptions(options);
      validateMaxVoxels(options.maxVoxels);
      return options;
    }
    setStatus(message, level = "normal") {
      const status = this.output("status");
      status.textContent = message;
      status.dataset.level = level;
    }
    updateState() {
      const previewButton = required(this.root, '[data-action="preview"]');
      const generateButton = required(this.root, '[data-action="generate"]');
      if (!this.image || !this.alphaHistogram) {
        for (const name of ["dimensions", "totalPixels", "visiblePixels", "voxelCount", "modelSize"]) {
          this.output(name).textContent = "\u2014";
        }
        previewButton.disabled = true;
        generateButton.disabled = true;
        return;
      }
      try {
        const options = this.options();
        const counts = countFromAlphaHistogram(
          this.alphaHistogram,
          options.alphaThreshold,
          options.includeTransparent
        );
        this.output("dimensions").textContent = this.image.width + " \xD7 " + this.image.height;
        this.output("totalPixels").textContent = String(counts.totalPixels);
        this.output("visiblePixels").textContent = String(counts.visiblePixels);
        this.output("voxelCount").textContent = String(counts.voxelCount);
        this.output("modelSize").textContent = [
          this.image.width * options.voxelSize,
          this.image.height * options.voxelSize,
          options.voxelSize
        ].join(" \xD7 ");
        const limit = getVoxelLimitStatus(counts.voxelCount, options.maxVoxels);
        previewButton.disabled = limit === "exceeded";
        generateButton.disabled = limit === "exceeded" || !this.plan || this.previewRevision !== this.revision;
        if (limit === "exceeded") {
          this.setStatus("\u9884\u8BA1 " + counts.voxelCount + " \u4E2A Cube\uFF0C\u8D85\u8FC7\u4E0A\u9650 " + options.maxVoxels + "\u3002", "error");
        } else if (limit === "warning") {
          this.setStatus("\u9884\u8BA1 " + counts.voxelCount + " \u4E2A Cube\uFF1B\u5927\u91CF Cube \u4F1A\u4E25\u91CD\u5F71\u54CD Blockbench \u6027\u80FD\u3002", "warning");
        } else if (this.previewRevision !== this.revision) {
          this.setStatus("\u914D\u7F6E\u5DF2\u66F4\u6539\uFF0C\u8BF7\u91CD\u65B0\u9884\u89C8\u3002");
        }
      } catch (error) {
        previewButton.disabled = true;
        generateButton.disabled = true;
        this.setStatus(messageOf(error), "error");
      }
    }
    async preview() {
      if (!this.image || !this.alphaHistogram) return;
      const image = this.image;
      let options;
      try {
        options = this.options();
        const count = countFromAlphaHistogram(
          this.alphaHistogram,
          options.alphaThreshold,
          options.includeTransparent
        ).voxelCount;
        if (getVoxelLimitStatus(count, options.maxVoxels) === "exceeded") return;
      } catch (error) {
        this.setStatus(messageOf(error), "error");
        return;
      }
      this.invalidate();
      const token = this.replaceTask();
      const revision = this.revision;
      let lastPercent = -1;
      this.setStatus("\u6B63\u5728\u89C4\u5212\u6A21\u578B\u2026");
      try {
        const plan = await planModel(image, options, {
          token,
          onProgress: (processed, total) => {
            const percent = Math.round(processed / total * 100);
            if (!token.cancelled && percent !== lastPercent) {
              lastPercent = percent;
              this.setStatus("\u6B63\u5728\u89C4\u5212\u6A21\u578B\u2026 " + percent + "%");
            }
          }
        });
        if (token.cancelled || revision !== this.revision) return;
        this.renderer = new PreviewRenderer(this.output("preview"));
        this.renderer.render(plan);
        this.plan = plan;
        this.previewRevision = revision;
        this.updateState();
        if (getVoxelLimitStatus(plan.voxelCount, options.maxVoxels) === "ok") {
          this.setStatus("\u9884\u89C8\u5C31\u7EEA\uFF1A" + plan.voxelCount + " \u4E2A Cube\u3002");
        }
      } catch (error) {
        this.renderer?.dispose();
        this.renderer = void 0;
        if (!(error instanceof TaskCancelledError)) this.setStatus(messageOf(error), "error");
      }
    }
    generate() {
      if (!this.image || !this.plan || this.previewRevision !== this.revision) return;
      try {
        const options = this.options();
        if (getVoxelLimitStatus(this.plan.voxelCount, options.maxVoxels) === "exceeded") return;
        if (!this.onGenerate) {
          this.setStatus("\u5DE5\u4F5C\u533A\u5199\u5165\u5C06\u5728\u4E0B\u4E00\u9636\u6BB5\u63A5\u5165\u3002");
          return;
        }
        this.onGenerate(this.image, this.plan, options);
        this.dialog.close();
      } catch (error) {
        this.setStatus(messageOf(error), "error");
      }
    }
    resize() {
      this.renderer?.resize();
    }
    dispose() {
      this.token?.cancel();
      this.renderer?.dispose();
      this.renderer = void 0;
      for (const cleanup of this.cleanup) cleanup();
      this.cleanup.length = 0;
      this.image = void 0;
      this.alphaHistogram = void 0;
      this.plan = void 0;
    }
  };
  function createGeneratorDialog(onGenerate) {
    let controller;
    const content = document.createElement("div");
    content.innerHTML = markup;
    const dialog = new Dialog({
      id: "texture_model_generator",
      title: "\u7EB9\u7406\u6A21\u578B\u751F\u6210\u5668",
      width: 920,
      resizable: "xy",
      lines: [content],
      buttons: ["\u53D6\u6D88"],
      onOpen() {
        controller?.dispose();
        controller = new GeneratorController(dialog, onGenerate);
      },
      onClose() {
        controller?.dispose();
        controller = void 0;
      },
      onResize() {
        controller?.resize();
      }
    });
    return {
      dialog,
      dispose() {
        controller?.dispose();
        controller = void 0;
        dialog.delete();
      }
    };
  }

  // src/ui/styles.ts
  var pluginStyles = `
.texture-model-shell {
  min-height: 400px;
  padding: 14px;
  color: var(--color-text);
}
.texture-model-columns { display: grid; grid-template-columns: minmax(310px, 1fr) minmax(300px, 1.2fr); gap: 16px; }
.texture-model-controls { max-height: min(75vh, 720px); overflow: auto; padding-right: 8px; }
.texture-model-controls section { margin-bottom: 14px; }
.texture-model-controls h3 { margin: 0 0 8px; font-size: 15px; }
.texture-model-controls label { display: flex; justify-content: space-between; align-items: center; gap: 10px; margin: 7px 0; }
.texture-model-controls label input[type=number], .texture-model-controls label input[type=text],
.texture-model-controls label select { width: 130px; min-width: 0; }
.texture-model-controls .texture-model-checkbox { justify-content: flex-start; }
.texture-model-controls .texture-model-file { justify-content: flex-start; cursor: pointer; }
.texture-model-controls .texture-model-file input { max-width: 190px; }
.texture-model-thumbnail { display: block; max-width: 100%; max-height: 110px; margin: 8px 0; image-rendering: pixelated; }
.texture-model-thumbnail[hidden] { display: none; }
.texture-model-stats div { display: flex; justify-content: space-between; margin: 4px 0; }
.texture-model-status { min-height: 2.5em; margin: 9px 0; }
.texture-model-status[data-level=warning] { color: #e0ac37; }
.texture-model-status[data-level=error] { color: #e56363; }
.texture-model-actions { display: flex; gap: 8px; }
.texture-model-preview-wrap { min-height: 340px; display: flex; flex-direction: column; }
.texture-model-preview { flex: 1; display: block; width: 100%; min-height: 300px; background: #20252b; border-radius: 6px; cursor: grab; }
.texture-model-preview-wrap p { text-align: center; margin: 6px 0; opacity: .7; }
@media (max-width: 750px) { .texture-model-columns { grid-template-columns: 1fr; } }
`;

  // src/index.ts
  var generatorDialog;
  var generatorAction;
  var aboutAction;
  var textureMenu;
  var style;
  BBPlugin.register("texture_model", {
    title: "Texture Model",
    author: "TODO: set plugin author",
    description: "Generate one textured cube for each selected image pixel.",
    icon: "view_in_ar",
    version: "0.1.0",
    variant: "both",
    min_version: "5.1.0",
    onload() {
      style = Blockbench.addCSS(pluginStyles);
      generatorAction = new Action("texture_model_open_generator", {
        name: "\u6253\u5F00\u7EB9\u7406\u6A21\u578B\u751F\u6210\u5668\u2026",
        icon: "image",
        click() {
          generatorDialog ?? (generatorDialog = createGeneratorDialog((image, plan, options) => {
            writeModel(image, plan, options);
            Blockbench.showQuickMessage("\u7EB9\u7406\u6A21\u578B\u5DF2\u751F\u6210");
          }));
          generatorDialog.dialog.show();
        }
      });
      aboutAction = new Action("texture_model_about", {
        name: "\u5173\u4E8E\u63D2\u4EF6",
        icon: "info",
        click() {
          Blockbench.showMessageBox({
            title: "\u7EB9\u7406\u6A21\u578B",
            message: "Texture Model 0.1.0\n\u5C06\u56FE\u7247\u50CF\u7D20\u8F6C\u6362\u4E3A Blockbench \u4F53\u7D20\u6A21\u578B\u3002",
            buttons: ["\u786E\u5B9A"]
          });
        }
      });
      textureMenu = new BarMenu("texture_model_menu", [generatorAction, aboutAction], {
        name: "\u7EB9\u7406\u6A21\u578B",
        icon: "view_in_ar"
      });
      MenuBar.addMenu(textureMenu, "tools");
    },
    onunload() {
      generatorDialog?.dispose();
      generatorDialog = void 0;
      textureMenu?.delete();
      textureMenu = void 0;
      generatorAction?.delete();
      generatorAction = void 0;
      aboutAction?.delete();
      aboutAction = void 0;
      style?.delete();
      style = void 0;
    }
  });
})();
