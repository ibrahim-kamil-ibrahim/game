import 'package:flutter/material.dart';

import '../../../core/theme/app_theme.dart';

class SplashScreen extends StatelessWidget {
  const SplashScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      backgroundColor: AppColors.navy,
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            DecoratedBox(
              decoration: BoxDecoration(
                color: AppColors.brand,
                borderRadius: BorderRadius.all(Radius.circular(18)),
              ),
              child: SizedBox(
                width: 64,
                height: 64,
                child: Icon(
                  Icons.sports_esports,
                  color: Colors.white,
                  size: 34,
                ),
              ),
            ),
            SizedBox(height: 18),
            Text(
              'GameZone Employer',
              style: TextStyle(
                color: Colors.white,
                fontSize: 18,
                fontWeight: FontWeight.w800,
              ),
            ),
            SizedBox(height: 6),
            Text(
              'Restoring your secure session...',
              style: TextStyle(color: AppColors.navy200, fontSize: 12),
            ),
            SizedBox(height: 22),
            SizedBox(
              width: 22,
              height: 22,
              child: CircularProgressIndicator(
                strokeWidth: 2,
                color: AppColors.brandLight,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
