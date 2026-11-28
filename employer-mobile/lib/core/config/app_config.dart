class AppConfig {
  static const String apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'https://game-rental-api-znao.onrender.com/api/v1',
  );
  static const String fallbackTimezone = 'Africa/Addis_Ababa';
  static const String appName = 'GameZone Employer';
  static const String appVersion = '1.0.0';
}
