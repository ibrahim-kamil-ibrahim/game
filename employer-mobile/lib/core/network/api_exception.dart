import 'package:dio/dio.dart';

class ApiException implements Exception {
  ApiException({
    required this.message,
    this.code = 'ERROR',
    this.statusCode = 0,
    this.details,
  });

  final String message;
  final String code;
  final int statusCode;
  final dynamic details;

  bool get isNetworkError => statusCode == 0;

  bool get isUnauthorized => statusCode == 401;

  bool get isConflict => statusCode == 409;

  factory ApiException.fromDio(DioException error) {
    final response = error.response;
    if (response == null) {
      return ApiException(
        message: 'Cannot reach the server. Check your internet connection and try again.',
        code: 'NETWORK_ERROR',
      );
    }

    final data = response.data;
    if (data is Map<String, dynamic>) {
      final payload = data['error'];
      if (payload is Map<String, dynamic>) {
        return ApiException(
          message:
              (payload['message'] as String?) ??
              'Something went wrong. Please try again.',
          code: (payload['code'] as String?) ?? 'ERROR',
          statusCode: response.statusCode ?? 0,
          details: payload['details'],
        );
      }
    }

    return ApiException(
      message:
          'Something went wrong (HTTP ${response.statusCode}). Please try again.',
      statusCode: response.statusCode ?? 0,
    );
  }

  factory ApiException.fromError(Object error) {
    if (error is ApiException) return error;
    if (error is DioException) return ApiException.fromDio(error);
    return ApiException(
      message: error.toString().replaceFirst('Exception: ', ''),
    );
  }

  @override
  String toString() => message;
}
