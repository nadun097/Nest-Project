/* eslint-disable prettier/prettier */
import { Injectable } from '@nestjs/common';
import * as sharp from 'sharp';
import { MessagePattern } from '@nestjs/microservices';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class ResizeService {
  @MessagePattern({ cmd: 'resize_image' })
  async resize(data: { imagePath: string; width: number; height: number }) {
    try {
      const { imagePath, width, height } = data;

      if (!fs.existsSync(imagePath)) {
        throw new Error('File does not exist');
      }

      const outputDir = path.join(process.cwd(), 'apps/basic-processing/output_images');
      const outputFileName = 'resized_image.png';
      const outputFilePath = path.join(outputDir, outputFileName);

      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      const inputImage = await fs.promises.readFile(imagePath);
      const { data: inputBuffer, info: inputInfo } = await sharp(inputImage).raw().toBuffer({ resolveWithObject: true });

      if (inputInfo.channels !== 3) {
        throw new Error('Unsupported image format: Only RGB images are supported');
      }

      const resizedBuffer = this.bilinearInterpolation(inputBuffer, inputInfo.width, inputInfo.height, width, height);

      // Save the resized image
      await sharp(resizedBuffer, {
        raw: {
          width: width,
          height: height,
          channels: inputInfo.channels,
        },
      })
        .png()
        .toFile(outputFilePath);

      return {
        success: true,
        message: 'Image resized successfully',
        savedImagePath: outputFilePath,
      };

    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  private bilinearInterpolation(
    inputBuffer: Buffer,
    inputWidth: number,
    inputHeight: number,
    outputWidth: number,
    outputHeight: number
  ): Buffer {
    const outputBuffer = Buffer.alloc(outputWidth * outputHeight * 3);

    for (let y = 0; y < outputHeight; y++) {
      for (let x = 0; x < outputWidth; x++) {
        const xRatio = (x / (outputWidth - 1)) * (inputWidth - 1);
        const yRatio = (y / (outputHeight - 1)) * (inputHeight - 1);

        const xL = Math.floor(xRatio);
        const xH = Math.min(Math.ceil(xRatio), inputWidth - 1);
        const yL = Math.floor(yRatio);
        const yH = Math.min(Math.ceil(yRatio), inputHeight - 1);

        const xWeight = xRatio - xL;
        const yWeight = yRatio - yL;

        for (let c = 0; c < 3; c++) {
          const topLeft = inputBuffer[(yL * inputWidth + xL) * 3 + c];
          const topRight = inputBuffer[(yL * inputWidth + xH) * 3 + c];
          const bottomLeft = inputBuffer[(yH * inputWidth + xL) * 3 + c];
          const bottomRight = inputBuffer[(yH * inputWidth + xH) * 3 + c];

          const top = topLeft + xWeight * (topRight - topLeft);
          const bottom = bottomLeft + xWeight * (bottomRight - bottomLeft);
          const value = top + yWeight * (bottom - top);

          outputBuffer[(y * outputWidth + x) * 3 + c] = Math.round(value);
        }
      }
    }

    return outputBuffer;
  }
}