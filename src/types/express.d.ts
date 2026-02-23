import { OrderValidationResult } from './orderTypes';

declare global {
  namespace Express {
    interface Request {
      user?: IUser;
      rawBody?: string;
      orderValidation?: OrderValidationResult;
    }
  }
}