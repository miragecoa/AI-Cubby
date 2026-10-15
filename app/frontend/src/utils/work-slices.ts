export async function runInSlices<T>(steps: Generator<void, T>, cancelled: () => boolean, paused: () => boolean = () => false): Promise<T | undefined> {
  try {
    while (!cancelled()) {
      await new Promise(resolve => setTimeout(resolve, paused() ? 32 : 0))
      if (paused()) continue
      const deadline = performance.now() + 4
      while (!cancelled() && !paused()) {
        const step = steps.next()
        if (step.done) return cancelled() ? undefined : step.value
        if (performance.now() >= deadline) break
      }
    }
  } finally {
    steps.return(undefined as never)
  }
  return undefined
}

export function* sortInSlices<T>(items: T[], compare: (a: T, b: T) => number): Generator<void, T[]> {
  let source = items
  let target: T[] = []
  // Stable merge sort yields during comparisons and copies, not just between passes.
  for (let width = 1; width < source.length; width *= 2) {
    for (let start = 0; start < source.length; start += width * 2) {
      const middle = Math.min(start + width, source.length)
      const end = Math.min(start + width * 2, source.length)
      let left = start
      let right = middle
      for (let dest = start; dest < end; dest++) {
        target[dest] = left < middle && (right >= end || compare(source[left], source[right]) <= 0)
          ? source[left++] : source[right++]
        yield
      }
    }
    ;[source, target] = [target, source]
  }
  return source
}
