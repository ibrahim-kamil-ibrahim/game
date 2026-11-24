class AppConfig {
  static const String apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://10.0.2.2:4000/api/v1',
  );
  static const String fallbackTimezone = 'Africa/Addis_Ababa';
  static const String appName = 'GameZone Employer';
  static const String appVersion = '1.0.0';
}
