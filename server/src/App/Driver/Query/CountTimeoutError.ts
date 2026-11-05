/** exact COUNT did not finish in its time limit - database stopped it, rows can only be estimated */
class CountTimeoutError extends Error {
  constructor(readonly timeoutMs: number) {
    super(`Count of rows takes more than ${timeoutMs} ms`);
  }
}

export default CountTimeoutError;
