const mp4url = "https://www.runoob.com/try/demo_source/movie.mp4";
const state = document.getElementById("state");
const mp4box = MP4Box.createFile();

// 这个是额外的处理方法，不需要关心里面的细节
const getExtradata = () => {
  // 生成VideoDecoder.configure需要的description信息
  const entry = mp4box.moov.traks[0].mdia.minf.stbl.stsd.entries[0];

  const box = entry.avcC ?? entry.hvcC ?? entry.vpcC;
  if (box != null) {
    const stream = new DataStream(undefined, 0, DataStream.BIG_ENDIAN);
    box.write(stream);
    // slice()方法的作用是移除moov box的header信息
    return new Uint8Array(stream.buffer.slice(8));
  }
};

// 视频轨道，解码用
let videoTrack = null;
let videoDecoder = null;
// 这个就是最终解码出来的视频画面序列文件
const videoFrames = [];

let nbSampleTotal = 0;
let countSample = 0;

mp4box.onReady = function (info) {
  // 记住视频轨道信息，onSamples匹配的时候需要
  videoTrack = info.videoTracks[0];

  if (videoTrack != null) {
    mp4box.setExtractionOptions(videoTrack.id, "video", {
      nbSamples: 100,
    });
  }

  // 视频的宽度和高度
  const videoW = videoTrack.track_width;
  const videoH = videoTrack.track_height;

  // 设置视频解码器
  videoDecoder = new VideoDecoder({
    output: (videoFrame) => {
      createImageBitmap(videoFrame).then((img) => {
        videoFrames.push({
          img,
          duration: videoFrame.duration,
          timestamp: videoFrame.timestamp,
        });
        state.innerHTML = "已获取帧数：" + videoFrames.length;
        const canvas = document.createElement("canvas");
        canvas.width = videoW;
        canvas.height = videoH;
        const ctx = canvas.getContext("2d");
        document.body.appendChild(canvas);
        ctx.drawImage(img, 0, 0);
        videoFrame.close();
      });
    },
    error: (err) => {
      console.error("videoDecoder错误：", err);
    },
  });

  nbSampleTotal = videoTrack.nb_samples;

  videoDecoder.configure({
    codec: videoTrack.codec,
    codedWidth: videoW,
    codedHeight: videoH,
    description: getExtradata(),
  });

  mp4box.start();
};

mp4box.onSamples = function (trackId, ref, samples) {
  // samples其实就是采用数据了
  if (videoTrack.id === trackId) {
    mp4box.stop();

    countSample += samples.length;

    for (const sample of samples) {
      const type = sample.is_sync ? "key" : "delta";

      const chunk = new EncodedVideoChunk({
        type,
        timestamp: sample.cts,
        duration: sample.duration,
        data: sample.data,
      });

      videoDecoder.decode(chunk);
    }

    if (countSample === nbSampleTotal) {
      videoDecoder.flush();
    }
  }
};

state.innerHTML = "开始获取视频";
// 获取视频的arraybuffer数据
fetch(mp4url)
  .then((res) => res.arrayBuffer())
  .then((buffer) => {
    state.innerHTML = "开始解码视频";
    // 因为文件较小，所以直接一次性写入
    // 如果文件较大，则需要res.body.getReader()创建reader对象，每次读取一部分数据
    // reader.read().then(({ done, value })
    buffer.fileStart = 0;
    mp4box.appendBuffer(buffer);
    mp4box.flush();
  });
