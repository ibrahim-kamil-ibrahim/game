import '../../../core/network/api_client.dart';
import '../../../core/network/api_exception.dart';
import '../models/auth_user.dart';

class AuthRepository {
  AuthRepository(this._api);

  final ApiClient _api;

  Future<AuthUser?> restoreSession() async {
    await _api.init();
    if (!_api.hasSession) return null;

    final refreshed = await _api.refreshSession();
    if (!refreshed) return null;

    try {
      final data = await _api.get('/auth/me');
      if (data is Map<String, dynamic> &&
          data['user'] is Map<String, dynamic>) {
        return AuthUser.fromJson(data['user'] as Map<String, dynamic>);
      }
      await _api.clearTokens();
      return null;
    } on ApiException {
      await _api.clearTokens();
      return null;
    }
  }

  Future<AuthUser> login({
    required String username,
    required String password,
  }) async {
    final data = await _api.post(
      '/auth/login',
      data: {'username': username.trim(), 'password': password},
    );

    if (data is! Map<String, dynamic>) {
      throw ApiException(message: 'Unexpected response from the server.');
    }

    final accessToken = data['accessToken'] as String?;
    final refreshToken = data['refreshToken'] as String?;
    final userJson = data['user'];

    if (accessToken == null ||
        refreshToken == null ||
        userJson is! Map<String, dynamic>) {
      throw ApiException(
        message: 'The server did not return a complete session.',
      );
    }

    await _api.setTokens(accessToken: accessToken, refreshToken: refreshToken);
    return AuthUser.fromJson(userJson);
  }

  Future<void> logout() async {
    try {
      await _api.postRaw(
        '/auth/logout',
        data: {'refreshToken': _api.refreshToken},
      );
    } catch (_) {
      // Local logout must always succeed even if the device is offline.
    } finally {
      await _api.clearTokens();
    }
  }

  Future<void> changePassword({
    required String currentPassword,
    required String newPassword,
  }) async {
    await _api.patch(
      '/auth/password',
      data: {'currentPassword': currentPassword, 'newPassword': newPassword},
    );
  }
}
