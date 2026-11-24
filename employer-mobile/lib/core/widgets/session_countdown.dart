import 'dart:async';

import 'package:flutter/material.dart';

import '../../features/sessions/models/session.dart';
import '../utils/formatters.dart';

/// Live countdown derived from the server-provided end timestamp. The device
/// clock is corrected with the server clock offset captured when the session
/// data was loaded, so changing the phone time cannot extend a session.
class SessionCountdown extends StatefulWidget {
  const SessionCountdown({
    super.key,
    required this.session,
    this.serverTime,
    this.style,
    this.showPaused = true,
    this.compact = false,
  });

  final SessionModel session;
  final DateTime? serverTime;
  final TextStyle? style;
  final bool showPaused;
  final bool compact;

  @override
  State<SessionCountdown> createState() => _SessionCountdownState();
}

class _SessionCountdownState extends State<SessionCountdown> {
  Timer? _timer;
  late Duration _offset;
  late int _remaining;
  late int _anchorRemaining;
  late DateTime _anchorTime;

  @override
  void initState() {
    super.initState();
    _updateOffset();
    _resetAnchor();
    _startTimer();
  }

  @override
  void didUpdateWidget(covariant SessionCountdown oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.serverTime != widget.serverTime ||
        oldWidget.session.id != widget.session.id ||
        oldWidget.session.endsAt != widget.session.endsAt ||
        oldWidget.session.status != widget.session.status ||
        oldWidget.session.remainingSeconds != widget.session.remainingSeconds) {
      _updateOffset();
      _resetAnchor();
      _startTimer();
    }
  }

  void _resetAnchor() {
    _anchorRemaining = widget.session.remainingSeconds;
    _anchorTime = DateTime.now();
    setState(() => _remaining = _computeRemaining());
  }

  void _updateOffset() {
    final serverTime = widget.serverTime;
    if (serverTime != null) {
      _offset = serverTime.difference(DateTime.now());
    } else {
      _offset = Duration.zero;
    }
  }

  void _startTimer() {
    _timer?.cancel();
    if (!widget.session.isRunning) return;
    _timer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted) return;
      setState(() => _remaining = _computeRemaining());
    });
  }

  int _computeRemaining() {
    if (widget.serverTime == null) {
      final elapsed = DateTime.now().difference(_anchorTime).inSeconds;
      final value = _anchorRemaining - elapsed;
      return value < 0 ? 0 : value;
    }
    final endsAt = widget.session.endsAt;
    if (endsAt == null) return widget.session.remainingSeconds;
    if (widget.session.isPaused) return widget.session.remainingSeconds;
    final seconds = endsAt.difference(DateTime.now().add(_offset)).inSeconds;
    return seconds < 0 ? 0 : seconds;
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (widget.session.isPaused && widget.showPaused) {
      return Text(
        'PAUSED',
        style: (widget.style ?? Theme.of(context).textTheme.displaySmall)
            ?.copyWith(
              color: const Color(0xFFD97706),
              fontWeight: FontWeight.w800,
              letterSpacing: 1.5,
            ),
      );
    }

    final finished =
        widget.session.status == 'COMPLETED' ||
        widget.session.status == 'EXPIRED' ||
        widget.session.status == 'CANCELLED';
    final urgent = !finished && _remaining <= 60;
    final warning = !finished && _remaining <= 300 && !urgent;
    final color = finished
        ? null
        : urgent
        ? const Color(0xFFDC2626)
        : warning
        ? const Color(0xFFD97706)
        : null;

    if (widget.compact) {
      return Text(
        formatCountdown(_remaining),
        style: (widget.style ?? const TextStyle()).copyWith(
          color: color,
          fontFeatures: const [FontFeature.tabularFigures()],
          fontFamily: 'monospace',
          fontWeight: FontWeight.w700,
        ),
      );
    }

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          formatCountdown(_remaining),
          style: (widget.style ?? Theme.of(context).textTheme.displayMedium)
              ?.copyWith(
                color: color,
                fontFeatures: const [FontFeature.tabularFigures()],
                fontFamily: 'monospace',
                fontWeight: FontWeight.w800,
                letterSpacing: 1,
              ),
        ),
        if (!widget.compact)
          Text(
            finished
                ? 'Session ended'
                : urgent
                ? 'Time is almost up'
                : warning
                ? 'Less than 5 minutes left'
                : 'remaining',
            style: TextStyle(
              fontSize: 12,
              color: color ?? const Color(0xFF6E93BB),
              fontWeight: FontWeight.w500,
            ),
          ),
      ],
    );
  }
}
