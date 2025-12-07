/**
 * Image Resize Utility
 * Automatically resizes and compresses images to meet size requirements
 * Used for profile pictures and other image uploads
 */

export interface ResizeOptions {
  maxWidth?: number;
  maxHeight?: number;
  maxSizeKB?: number; // Maximum file size in KB
  quality?: number; // JPEG quality (0-1)
  maintainAspectRatio?: boolean;
  cropToFit?: boolean; // Crop to exact dimensions (for avatars)
}

/**
 * Resize and compress an image file
 * @param file - Original image file
 * @param options - Resize options
 * @returns Promise<File> - Resized and compressed image file
 */
export async function resizeImage(
  file: File,
  options: ResizeOptions = {}
): Promise<File> {
  const {
    maxWidth = 256,
    maxHeight = 256,
    maxSizeKB = 500,
    quality = 0.85,
    maintainAspectRatio = true,
    cropToFit = false,
  } = options;

  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      const img = new Image();
      
      img.onload = () => {
        try {
          // Calculate new dimensions
          let width = img.width;
          let height = img.height;
          
          if (cropToFit) {
            // Crop to exact dimensions (for avatars)
            width = maxWidth;
            height = maxHeight;
          } else if (maintainAspectRatio) {
            // Maintain aspect ratio, fit within max dimensions
            const ratio = Math.min(maxWidth / width, maxHeight / height);
            width = width * ratio;
            height = height * ratio;
          } else {
            // Scale to max dimensions
            if (width > maxWidth) width = maxWidth;
            if (height > maxHeight) height = maxHeight;
          }

          // Create canvas
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');

          if (!ctx) {
            reject(new Error('Could not get canvas context'));
            return;
          }

          // For avatars, use center crop
          if (cropToFit) {
            // Calculate source crop area (center crop)
            const sourceAspect = img.width / img.height;
            const targetAspect = maxWidth / maxHeight;
            
            let sourceX = 0;
            let sourceY = 0;
            let sourceWidth = img.width;
            let sourceHeight = img.height;

            if (sourceAspect > targetAspect) {
              // Image is wider, crop width
              sourceWidth = img.height * targetAspect;
              sourceX = (img.width - sourceWidth) / 2;
            } else {
              // Image is taller, crop height
              sourceHeight = img.width / targetAspect;
              sourceY = (img.height - sourceHeight) / 2;
            }

            ctx.drawImage(
              img,
              sourceX, sourceY, sourceWidth, sourceHeight,
              0, 0, width, height
            );
          } else {
            // Regular resize
            ctx.drawImage(img, 0, 0, width, height);
          }

          // Convert to blob with compression
          let currentQuality = quality;
          let attempts = 0;
          const maxAttempts = 5;

          const tryCompress = (): void => {
            canvas.toBlob(
              (blob) => {
                if (!blob) {
                  reject(new Error('Failed to create blob'));
                  return;
                }

                const sizeKB = blob.size / 1024;

                // If size is acceptable or we've tried enough times, return
                if (sizeKB <= maxSizeKB || attempts >= maxAttempts) {
                  // Create a new File object with the resized image
                  const resizedFile = new File(
                    [blob],
                    file.name,
                    {
                      type: 'image/jpeg', // Always convert to JPEG for better compression
                      lastModified: Date.now(),
                    }
                  );
                  resolve(resizedFile);
                } else {
                  // Reduce quality and try again
                  attempts++;
                  currentQuality = Math.max(0.5, currentQuality - 0.1);
                  tryCompress();
                }
              },
              'image/jpeg', // Always use JPEG for better compression
              currentQuality
            );
          };

          tryCompress();
        } catch (error) {
          reject(error);
        }
      };

      img.onerror = () => {
        reject(new Error('Failed to load image'));
      };

      if (e.target?.result) {
        img.src = e.target.result as string;
      } else {
        reject(new Error('Failed to read file'));
      }
    };

    reader.onerror = () => {
      reject(new Error('Failed to read file'));
    };

    reader.readAsDataURL(file);
  });
}

/**
 * Resize image specifically for profile avatars
 * @param file - Original image file
 * @returns Promise<File> - Resized avatar (256x256, <500KB)
 */
export async function resizeAvatar(file: File): Promise<File> {
  return resizeImage(file, {
    maxWidth: 256,
    maxHeight: 256,
    maxSizeKB: 500,
    quality: 0.85,
    maintainAspectRatio: false,
    cropToFit: true, // Crop to exact 256x256 for avatars
  });
}

/**
 * Check if image needs resizing based on file size
 * @param file - Image file to check
 * @param maxSizeKB - Maximum size in KB
 * @returns boolean - True if image needs resizing
 */
export function needsResize(
  file: File,
  maxSizeKB: number = 500
): boolean {
  const sizeKB = file.size / 1024;
  
  // Resize if file is over 80% of max size (to leave room for compression)
  return sizeKB > maxSizeKB * 0.8;
}

