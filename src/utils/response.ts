class ApiResponse {
  success: boolean;
  statusCode: number;
  message: string;
  data: any;

  constructor(statusCode: number, data: any, message = 'Success') {
    this.success = true;
    this.statusCode = statusCode;
    this.message = message;
    this.data = data;
  }

  static success(data: any, message = 'Success'): ApiResponse {
    return new ApiResponse(200, data, message);
  }

  static created(data: any, message = 'Resource created successfully'): ApiResponse {
    return new ApiResponse(201, data, message);
  }

  static noContent(message = 'No content'): ApiResponse {
    return new ApiResponse(204, null, message);
  }
}

export default ApiResponse;