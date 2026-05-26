import sharp from "sharp";
import { saveFile, deleteFile, StorageKey } from "../storage.js";

/**
 * Process and save a committee/safety officer contact photo.
 * Resizes to 300×300px square, strips EXIF data automatically via Sharp.
 *
 * @param imageBuffer Raw image file buffer
 * @param contactId Contact ID to include in filename
 * @returns Public URL to the saved photo
 */
export async function saveContactPhoto(imageBuffer: Buffer, contactId: string): Promise<string> {
  try {
    // Resize to 300×300, strip EXIF (Sharp does this automatically on resize)
    const resized = await sharp(imageBuffer)
      .resize(300, 300, {
        fit: "cover",
        position: "center",
      })
      .jpeg({ quality: 90 })
      .toBuffer();

    // Generate unique filename with timestamp
    const timestamp = Date.now();
    const filename = `${contactId}-${timestamp}.jpg`;
    const key = `contacts/photos/${filename}`;

    // Save to R2 or local storage
    const photoUrl = await saveFile(resized, key, "image/jpeg");
    return photoUrl;
  } catch (err) {
    console.error(`[photoService] Failed to process contact photo for ${contactId}:`, err);
    throw new Error("Failed to process image. Please ensure it's a valid JPEG, PNG, or WebP file.");
  }
}

/**
 * Delete a contact photo from storage.
 *
 * @param photoUrl URL to delete (R2 https:// or local /uploads/...)
 */
export async function deleteContactPhoto(photoUrl: string): Promise<void> {
  if (!photoUrl) return;
  try {
    await deleteFile(photoUrl);
  } catch (err) {
    console.error(`[photoService] Failed to delete photo ${photoUrl}:`, err);
    throw new Error("Failed to delete photo");
  }
}
