declare module 'sns-validator' {
  export default class MessageValidator {
    validate(message: string, cb: (err: Error | null, message: Record<string, unknown>) => void): void;
  }
}
