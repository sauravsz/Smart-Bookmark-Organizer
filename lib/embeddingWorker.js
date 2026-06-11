import { pipeline, env } from '@xenova/transformers'

// Skip local model check since we are running in browser
env.allowLocalModels = false

class PipelineSingleton {
  static task = 'feature-extraction'
  static model = 'Xenova/all-MiniLM-L6-v2'
  static instance = null

  static async getInstance(progress_callback = null) {
    if (this.instance === null) {
      this.instance = pipeline(this.task, this.model, { progress_callback })
    }
    return this.instance
  }
}

self.addEventListener('message', async (event) => {
  const { text, id } = event.data
  try {
    const extractor = await PipelineSingleton.getInstance((x) => {
      self.postMessage({ status: 'progress', progress: x, id })
    })

    const output = await extractor(text, { pooling: 'mean', normalize: true })
    self.postMessage({ status: 'complete', embedding: Array.from(output.data), id })
  } catch (err) {
    self.postMessage({ status: 'error', error: err.message, id })
  }
})
