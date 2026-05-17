import React from 'react';
import { Text } from 'ink';
import { RISK_COLORS, RISK_LABELS, BATCH_COLORS, BATCH_LABELS, SYM } from '../theme.js';

const STATUS_SYM = { pending: SYM.dot, completed: SYM.check, failed: SYM.cross };

export function BatchBadge({ status }) {
  const color  = BATCH_COLORS[status] ?? 'gray';
  const label  = BATCH_LABELS[status] ?? status;
  const symbol = STATUS_SYM[status] ?? SYM.dot;
  return <Text color={color}>{symbol} {label}</Text>;
}

export function RiskBadge({ level }) {
  const color = RISK_COLORS[level] ?? 'gray';
  const label = RISK_LABELS[level] ?? level;
  const sym   = level === 'critical' ? SYM.cross
              : level === 'high'     ? SYM.warn
              : level === 'medium'   ? SYM.dot
              : SYM.check;
  return <Text color={color} bold>{sym} {label}</Text>;
}
