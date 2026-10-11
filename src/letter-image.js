import { fail } from "./letter-validation-error.js";
// Read only image headers; never decompress untrusted pixels in the web process.
export function imageDimensions(src) {
  if (
    !/^data:image\/(png|jpeg);base64,[a-zA-Z0-9+/=]+$/.test(src) ||
    src.length > 1_250_000
  )
    throw fail("Choose a PNG or JPEG smaller than 900 KB.");
  const data = Buffer.from(src.split(",")[1], "base64");
  let width, height;
  if (
    src.startsWith("data:image/png") &&
    data.length >= 24 &&
    data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  ) {
    width = data.readUInt32BE(16);
    height = data.readUInt32BE(20);
  } else if (
    src.startsWith("data:image/jpeg") &&
    data[0] === 255 &&
    data[1] === 216
  ) {
    for (let i = 2; i + 8 < data.length; ) {
      if (data[i] !== 255) break;
      const marker = data[i + 1];
      if (marker === 217 || marker === 218) break;
      const length = data.readUInt16BE(i + 2);
      if (length < 2 || i + 2 + length > data.length) break;
      if (
        [
          192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207,
        ].includes(marker)
      ) {
        height = data.readUInt16BE(i + 5);
        width = data.readUInt16BE(i + 7);
        break;
      }
      i += 2 + length;
    }
  }
  if (
    !width ||
    !height ||
    width > 8000 ||
    height > 8000 ||
    width * height > 20_000_000
  )
    throw fail("Invalid or overly large image dimensions.");
  return {
    data,
    width,
    height,
    type: src.startsWith("data:image/png") ? "png" : "jpg",
  };
}
