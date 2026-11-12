class CaptureProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const channels = inputs[0];
    if (channels?.length) this.port.postMessage([channels[0].slice(), (channels[1] || channels[0]).slice()]);
    return true;
  }
}
registerProcessor('tabtone-capture', CaptureProcessor);
