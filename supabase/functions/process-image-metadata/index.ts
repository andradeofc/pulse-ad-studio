// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import piexif from "https://esm.sh/piexifjs@1.0.6";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ─── Device profiles (mirror of user's Python script) ──────────────────────
const DEVICES = [
  {
    make: "Samsung",
    model: "SM-S928B",
    software: "S928BXXU4AXL1",
    focal_length: [6600, 1000],
    f_number: [17, 10],
    iso: () => randInt(50, 400),
    exposure: () =>
      pickRandom([[1, 60], [1, 120], [1, 250], [1, 500]]),
    lens_make: "Samsung",
    lens_model: "Samsung S5KHP2 200MP",
    image_width: 4000,
    image_height: 3000,
  },
  {
    make: "Apple",
    model: "iPhone 15 Pro Max",
    software: "17.4.1",
    focal_length: [6860, 1000],
    f_number: [178, 100],
    iso: () => randInt(32, 800),
    exposure: () =>
      pickRandom([[1, 60], [1, 121], [1, 244], [1, 500]]),
    lens_make: "Apple",
    lens_model: "iPhone 15 Pro Max back triple camera 6.86mm f/1.78",
    image_width: 4032,
    image_height: 3024,
  },
  {
    make: "Xiaomi",
    model: "2311DRK48C",
    software: "V816.0.4.0.UNACNXM",
    focal_length: [5900, 1000],
    f_number: [163, 100],
    iso: () => randInt(50, 640),
    exposure: () =>
      pickRandom([[1, 50], [1, 100], [1, 200], [1, 500]]),
    lens_make: "Xiaomi",
    lens_model: "Xiaomi Leica Summilux 1:1.63/23 ASPH.",
    image_width: 4096,
    image_height: 3072,
  },
];

function randInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function decimalToDms(decimal: number): [number[], number[], number[]] {
  decimal = Math.abs(decimal);
  const degrees = Math.floor(decimal);
  const minutesFull = (decimal - degrees) * 60;
  const minutes = Math.floor(minutesFull);
  const seconds = Math.round((minutesFull - minutes) * 60 * 10000);
  return [[degrees, 1], [minutes, 1], [seconds, 10000]];
}

function recentDateTime(): Date {
  const now = new Date();
  const minsAgo = randInt(1, 10);
  const secsAgo = randInt(0, 59);
  return new Date(now.getTime() - (minsAgo * 60 + secsAgo) * 1000);
}

function formatExifDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}:${pad(d.getMonth() + 1)}:${pad(d.getDate())} ${
    pad(d.getHours())
  }:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

async function md5Hex(s: string): Promise<string> {
  // simple md5 surrogate via SHA-1 truncated (good enough as ImageUniqueID)
  const buf = new TextEncoder().encode(s);
  const hash = await crypto.subtle.digest("SHA-1", buf);
  return Array.from(new Uint8Array(hash))
    .slice(0, 16)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function buildExif(includeGps = true) {
  const device = pickRandom(DEVICES);
  const dt = recentDateTime();
  const dtStr = formatExifDate(dt);
  const subsec = String(randInt(100, 999));

  const zeroth: Record<number, any> = {
    [piexif.ImageIFD.Make]: device.make,
    [piexif.ImageIFD.Model]: device.model,
    [piexif.ImageIFD.Software]: device.software,
    [piexif.ImageIFD.DateTime]: dtStr,
    [piexif.ImageIFD.Orientation]: 1,
    [piexif.ImageIFD.XResolution]: [72, 1],
    [piexif.ImageIFD.YResolution]: [72, 1],
    [piexif.ImageIFD.ResolutionUnit]: 2,
    [piexif.ImageIFD.YCbCrPositioning]: 1,
  };

  const exif: Record<number, any> = {
    [piexif.ExifIFD.ExposureTime]: device.exposure(),
    [piexif.ExifIFD.FNumber]: device.f_number,
    [piexif.ExifIFD.ISOSpeedRatings]: device.iso(),
    [piexif.ExifIFD.ExifVersion]: "0232",
    [piexif.ExifIFD.DateTimeOriginal]: dtStr,
    [piexif.ExifIFD.DateTimeDigitized]: dtStr,
    [piexif.ExifIFD.SubSecTime]: subsec,
    [piexif.ExifIFD.SubSecTimeOriginal]: subsec,
    [piexif.ExifIFD.SubSecTimeDigitized]: subsec,
    [piexif.ExifIFD.ShutterSpeedValue]: [10, 1],
    [piexif.ExifIFD.ApertureValue]: [153, 100],
    [piexif.ExifIFD.BrightnessValue]: [500, 100],
    [piexif.ExifIFD.ExposureBiasValue]: [0, 10],
    [piexif.ExifIFD.MaxApertureValue]: [153, 100],
    [piexif.ExifIFD.MeteringMode]: 2,
    [piexif.ExifIFD.Flash]: 0,
    [piexif.ExifIFD.FocalLength]: device.focal_length,
    [piexif.ExifIFD.ColorSpace]: 1,
    [piexif.ExifIFD.PixelXDimension]: device.image_width,
    [piexif.ExifIFD.PixelYDimension]: device.image_height,
    [piexif.ExifIFD.ExposureMode]: 0,
    [piexif.ExifIFD.WhiteBalance]: 0,
    [piexif.ExifIFD.FocalLengthIn35mmFilm]: 24,
    [piexif.ExifIFD.SceneCaptureType]: 0,
    [piexif.ExifIFD.LensMake]: device.lens_make,
    [piexif.ExifIFD.LensModel]: device.lens_model,
    [piexif.ExifIFD.ImageUniqueID]: await md5Hex(`${dtStr}${Math.random()}`),
  };

  const exifDict: any = {
    "0th": zeroth,
    "Exif": exif,
    "1st": {
      [piexif.ImageIFD.Orientation]: 1,
      [piexif.ImageIFD.XResolution]: [72, 1],
      [piexif.ImageIFD.YResolution]: [72, 1],
      [piexif.ImageIFD.ResolutionUnit]: 2,
    },
  };

  if (includeGps) {
    const lat = -3.7327 + (Math.random() - 0.5) * 0.1;
    const lon = -38.527 + (Math.random() - 0.5) * 0.1;
    const utc = new Date(dt.getTime() + 3 * 3600 * 1000);

    exifDict["GPS"] = {
      [piexif.GPSIFD.GPSVersionID]: [2, 3, 0, 0],
      [piexif.GPSIFD.GPSLatitudeRef]: lat < 0 ? "S" : "N",
      [piexif.GPSIFD.GPSLatitude]: decimalToDms(lat),
      [piexif.GPSIFD.GPSLongitudeRef]: lon < 0 ? "W" : "E",
      [piexif.GPSIFD.GPSLongitude]: decimalToDms(lon),
      [piexif.GPSIFD.GPSAltitudeRef]: 0,
      [piexif.GPSIFD.GPSAltitude]: [randInt(10, 80), 1],
      [piexif.GPSIFD.GPSTimeStamp]: [
        [utc.getUTCHours(), 1],
        [utc.getUTCMinutes(), 1],
        [utc.getUTCSeconds(), 1],
      ],
      [piexif.GPSIFD.GPSDateStamp]: `${utc.getUTCFullYear()}:${
        String(utc.getUTCMonth() + 1).padStart(2, "0")
      }:${String(utc.getUTCDate()).padStart(2, "0")}`,
    };
  }

  return exifDict;
}

// piexifjs works on binary strings. Convert Uint8Array <-> binary string.
function bytesToBinaryString(bytes: Uint8Array): string {
  let s = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    s += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return s;
}
function binaryStringToBytes(s: string): Uint8Array {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
  return out;
}

// Insert random JPEG COM marker after SOI to change file hash
function injectComMarker(bytes: Uint8Array): Uint8Array {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return bytes;
  const random = crypto.getRandomValues(new Uint8Array(32));
  const len = random.length + 2;
  const seg = new Uint8Array(2 + 2 + random.length);
  seg[0] = 0xff;
  seg[1] = 0xfe;
  seg[2] = (len >> 8) & 0xff;
  seg[3] = len & 0xff;
  seg.set(random, 4);
  const out = new Uint8Array(bytes.length + seg.length);
  out.set(bytes.subarray(0, 2), 0);
  out.set(seg, 2);
  out.set(bytes.subarray(2), 2 + seg.length);
  return out;
}

// PNG → JPEG conversion using ImageScript (works in Deno)
async function ensureJpeg(
  bytes: Uint8Array,
  mime: string,
): Promise<Uint8Array> {
  if (mime === "image/jpeg" || mime === "image/jpg") return bytes;
  if (mime === "image/png") {
    const { Image } = await import(
      "https://deno.land/x/imagescript@1.2.17/mod.ts"
    );
    const img = await Image.decode(bytes);
    return await img.encodeJPEG(95);
  }
  throw new Error(`Tipo não suportado: ${mime}`);
}

async function processOne(
  supabase: any,
  creativeId: string,
  userId: string,
): Promise<{ id: string; ok: boolean; error?: string }> {
  try {
    const { data: creative, error } = await supabase
      .from("creatives")
      .select("id, user_id, file_path, type, name")
      .eq("id", creativeId)
      .maybeSingle();
    if (error) throw error;
    if (!creative) throw new Error("Criativo não encontrado");
    if (creative.user_id !== userId) throw new Error("Sem permissão");
    if (creative.type !== "image") {
      return { id: creativeId, ok: false, error: "Não é imagem" };
    }

    const { data: blob, error: dlErr } = await supabase.storage
      .from("creatives")
      .download(creative.file_path);
    if (dlErr) throw dlErr;

    const ab = await blob.arrayBuffer();
    let bytes = new Uint8Array(ab);
    const ext = (creative.file_path.split(".").pop() || "").toLowerCase();
    const mime = ext === "png"
      ? "image/png"
      : ext === "webp"
      ? "image/webp"
      : "image/jpeg";

    // Convert to JPEG if needed
    bytes = await ensureJpeg(bytes, mime);

    // Inject EXIF
    const exifDict = await buildExif(true);
    const exifBytes = piexif.dump(exifDict);
    const binStr = bytesToBinaryString(bytes);
    const dataUrl = "data:image/jpeg;base64," + btoa(binStr);
    const newDataUrl = piexif.insert(exifBytes, dataUrl);
    const newBin = atob(newDataUrl.split(",")[1]);
    let outBytes = binaryStringToBytes(newBin);

    // Alter hash via COM marker
    outBytes = injectComMarker(outBytes);

    // Overwrite same path (keeps name & ID)
    const { error: upErr } = await supabase.storage
      .from("creatives")
      .upload(creative.file_path, outBytes, {
        contentType: "image/jpeg",
        upsert: true,
        cacheControl: "3600",
      });
    if (upErr) throw upErr;

    // Bump updated_at + size
    await supabase
      .from("creatives")
      .update({ size: outBytes.length, updated_at: new Date().toISOString() })
      .eq("id", creativeId);

    return { id: creativeId, ok: true };
  } catch (e: any) {
    return { id: creativeId, ok: false, error: e?.message || String(e) };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    if (!token) {
      return new Response(JSON.stringify({ error: "Não autenticado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify user via JWT
    const userClient = createClient(
      SUPABASE_URL,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: `Bearer ${token}` } } },
    );
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Não autenticado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolve effective user (collaborators)
    const { data: tm } = await userClient
      .from("team_members")
      .select("owner_id")
      .eq("member_id", user.id)
      .eq("status", "active")
      .maybeSingle();
    const effectiveUserId = tm?.owner_id || user.id;

    const body = await req.json().catch(() => ({}));
    const { creativeIds, folderId } = body as {
      creativeIds?: string[];
      folderId?: string | null;
    };

    // Service-role client to bypass RLS (we already validated ownership)
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    let ids: string[] = [];
    if (Array.isArray(creativeIds) && creativeIds.length) {
      ids = creativeIds;
    } else if (folderId !== undefined) {
      const q = admin
        .from("creatives")
        .select("id")
        .eq("user_id", effectiveUserId)
        .eq("type", "image");
      const { data, error } = folderId === null
        ? await q.is("folder_id", null)
        : await q.eq("folder_id", folderId);
      if (error) throw error;
      ids = (data || []).map((r: any) => r.id);
    } else {
      return new Response(
        JSON.stringify({ error: "creativeIds ou folderId obrigatório" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Process sequentially with small concurrency (3 at a time)
    const results: Array<{ id: string; ok: boolean; error?: string }> = [];
    const CONCURRENCY = 3;
    for (let i = 0; i < ids.length; i += CONCURRENCY) {
      const slice = ids.slice(i, i + CONCURRENCY);
      const r = await Promise.all(
        slice.map((id) => processOne(admin, id, effectiveUserId)),
      );
      results.push(...r);
    }

    const succeeded = results.filter((r) => r.ok).length;
    const failed = results.length - succeeded;

    return new Response(
      JSON.stringify({
        total: results.length,
        succeeded,
        failed,
        results,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (e: any) {
    console.error("process-image-metadata error:", e);
    return new Response(
      JSON.stringify({ error: e?.message || "Erro interno" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
