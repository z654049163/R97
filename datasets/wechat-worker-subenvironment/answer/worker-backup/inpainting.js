// worker/inpainting.js

/**
 * 微信小程序 Worker 专用语法
 * 简单的图像修复：找出 mask 区域，用周围非 mask 的像素进行填充
 */
worker.onMessage(function (res) {
  // 注意：微信小程序里接收到的数据在 res 直接点出来，而不是 res.data
  const { imageData, maskData, width, height } = res;

  const img = new Uint8ClampedArray(imageData);
  const mask = new Uint8ClampedArray(maskData);

  // 多次迭代以填充较大面积的涂抹（简单扩散算法）
  const iterations = 5; 

  for (let iter = 0; iter < iterations; iter++) {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        
        // 如果 mask 的 R 通道大于 128 (即白色涂抹区域)
        if (mask[idx] > 128) {
          let rSum = 0, gSum = 0, bSum = 0, count = 0;
          
          // 扩大搜索范围到 5x5 邻域
          for (let dy = -2; dy <= 2; dy++) {
            for (let dx = -2; dx <= 2; dx++) {
              const nx = x + dx;
              const ny = y + dy;
              
              if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                const nIdx = (ny * width + nx) * 4;
                // 只取非涂抹区域的像素来参考
                if (mask[nIdx] === 0) {
                  rSum += img[nIdx];
                  gSum += img[nIdx + 1];
                  bSum += img[nIdx + 2];
                  count++;
                }
              }
            }
          }
          
          if (count > 0) {
            img[idx] = rSum / count;
            img[idx + 1] = gSum / count;
            img[idx + 2] = bSum / count;
            // 修复后，将该点的 mask 标记为已处理 (设为0)，方便下一次迭代向内推进
            mask[idx] = 0; 
          }
        }
      }
    }
  }

  // 将处理完的数据发送回主线程
  worker.postMessage({
    processedData: img.buffer
  });
});