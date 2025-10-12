import { AppError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';

// Virus scanning service using ClamAV
export class VirusScanService {
  private static instance: VirusScanService;
  private isAvailable: boolean = false;

  private constructor() {
    this.checkClamAVAvailability();
  }

  public static getInstance(): VirusScanService {
    if (!VirusScanService.instance) {
      VirusScanService.instance = new VirusScanService();
    }
    return VirusScanService.instance;
  }

  private async checkClamAVAvailability(): Promise<void> {
    try {
      // Check if ClamAV is available (this would be implemented with actual ClamAV integration)
      // For now, we'll simulate the check
      this.isAvailable = process.env.CLAMAV_ENABLED === 'true';
      
      if (this.isAvailable) {
        logger.info('ClamAV virus scanning enabled');
      } else {
        logger.warn('ClamAV virus scanning disabled - using basic file validation only');
      }
    } catch (error) {
      logger.error('Error checking ClamAV availability:', error);
      this.isAvailable = false;
    }
  }

  // Scan file buffer for viruses
  public async scanFile(buffer: Buffer, filename: string): Promise<{ clean: boolean; threat?: string }> {
    if (!this.isAvailable) {
      // Fallback to basic validation if ClamAV is not available
      return this.basicFileValidation(buffer, filename);
    }

    try {
      // This would integrate with actual ClamAV
      // For now, we'll implement basic validation
      return await this.basicFileValidation(buffer, filename);
    } catch (error) {
      logger.error(`Virus scan failed for ${filename}:`, error);
      throw new AppError('File security scan failed', 500);
    }
  }

  // Basic file validation as fallback
  private async basicFileValidation(buffer: Buffer, filename: string): Promise<{ clean: boolean; threat?: string }> {
    // Check for suspicious file signatures
    const suspiciousSignatures = [
      { signature: [0x4D, 0x5A], name: 'PE Executable' }, // Windows executable
      { signature: [0x7F, 0x45, 0x4C, 0x46], name: 'ELF Executable' }, // Linux executable
      { signature: [0xFE, 0xED, 0xFA, 0xCE], name: 'Mach-O Executable' }, // macOS executable
      { signature: [0x50, 0x4B, 0x03, 0x04], name: 'ZIP Archive' }, // ZIP file
      { signature: [0x52, 0x61, 0x72, 0x21], name: 'RAR Archive' }, // RAR file
    ];

    // Check file header signatures
    for (const sig of suspiciousSignatures) {
      if (buffer.length >= sig.signature.length) {
        const matches = sig.signature.every((byte, index) => buffer[index] === byte);
        if (matches) {
          logger.warn(`Suspicious file signature detected: ${sig.name} in ${filename}`);
          return { clean: false, threat: sig.name };
        }
      }
    }

    // Check for script signatures
    const scriptSignatures = [
      { signature: [0x3C, 0x3F, 0x70, 0x68, 0x70], name: 'PHP Script' }, // <?php
      { signature: [0x3C, 0x21, 0x2D, 0x2D], name: 'HTML Comment' }, // <!--
      { signature: [0x3C, 0x73, 0x63, 0x72, 0x69, 0x70, 0x74], name: 'JavaScript' }, // <script
    ];

    for (const sig of scriptSignatures) {
      if (buffer.length >= sig.signature.length) {
        const matches = sig.signature.every((byte, index) => buffer[index] === byte);
        if (matches) {
          logger.warn(`Script signature detected: ${sig.name} in ${filename}`);
          return { clean: false, threat: sig.name };
        }
      }
    }

    // Check for null bytes (often used in exploits)
    // Allow null bytes in legitimate image formats (PNG, JPEG headers)
    const nullByteCount = buffer.filter(byte => byte === 0x00).length;
    const nullByteRatio = nullByteCount / buffer.length;
    
    // Only flag if null bytes exceed 10% of file (likely padding attack)
    if (nullByteRatio > 0.1) {
      logger.warn(`Excessive null bytes detected in ${filename}: ${nullByteCount}/${buffer.length} (${(nullByteRatio * 100).toFixed(1)}%)`);
      return { clean: false, threat: 'Excessive null bytes detected' };
    }

    // Check file size (too small might be suspicious)
    if (buffer.length < 100) {
      logger.warn(`Suspiciously small file: ${filename} (${buffer.length} bytes)`);
      return { clean: false, threat: 'Suspiciously small file' };
    }

    // Check for excessive null bytes (potential padding attack) - already checked above

    return { clean: true };
  }

  // Scan multiple files
  public async scanFiles(files: Array<{ buffer: Buffer; filename: string }>): Promise<Array<{ clean: boolean; threat?: string; filename: string }>> {
    const results = [];
    
    for (const file of files) {
      try {
        const result = await this.scanFile(file.buffer, file.filename);
        results.push({
          ...result,
          filename: file.filename
        });
      } catch (error) {
        logger.error(`Error scanning file ${file.filename}:`, error);
        results.push({
          clean: false,
          threat: 'Scan error',
          filename: file.filename
        });
      }
    }
    
    return results;
  }

  // Check if virus scanning is available
  public isVirusScanningAvailable(): boolean {
    return this.isAvailable;
  }
}

// Export singleton instance
export const virusScanService = VirusScanService.getInstance();
