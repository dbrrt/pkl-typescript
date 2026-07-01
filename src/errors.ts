/**
 * Thrown when the Pkl evaluator reports an error (e.g. a Pkl compile error,
 * a failed constraint, or a resource that could not be read).
 *
 * The `message` contains the rendered Pkl error, including source location and
 * hint output, exactly as the `pkl` CLI would print it.
 */
export class PklError extends Error {
  override name = "PklError";
  constructor(message: string) {
    super(message);
  }
}

/**
 * Thrown for problems in the binding itself: the `pkl` process failing to
 * start, exiting unexpectedly, protocol/decoding violations, or misuse of the
 * API (such as using an Evaluator after it has been closed).
 */
export class PklBindingError extends Error {
  override name = "PklBindingError";
  constructor(message: string) {
    super(message);
  }
}
