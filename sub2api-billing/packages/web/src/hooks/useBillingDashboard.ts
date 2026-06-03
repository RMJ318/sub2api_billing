import { useQuery } from '@tanstack/react-query';
import {
  fetchCost,
  fetchDashboard,
  fetchHealth,
  fetchKeys,
  fetchKeyTrend,
  fetchMonths,
  fetchModels,
  fetchSignals,
  fetchUserTrend,
  fetchUsers,
} from '../lib/api.js';

export function useHealth() {
  return useQuery({
    queryKey: ['health'],
    queryFn: fetchHealth,
    staleTime: 60_000,
  });
}

export function useMonths() {
  return useQuery({
    queryKey: ['months'],
    queryFn: fetchMonths,
    staleTime: 60_000,
  });
}

export function useDashboard(billingMonth: string | null) {
  return useQuery({
    queryKey: ['dashboard', billingMonth],
    queryFn: () => fetchDashboard(billingMonth as string),
    enabled: billingMonth !== null && billingMonth.trim() !== '',
    staleTime: 60_000,
  });
}

export function useUsers(billingMonth: string | null) {
  return useQuery({
    queryKey: ['users', billingMonth],
    queryFn: () => fetchUsers(billingMonth as string),
    enabled: billingMonth !== null && billingMonth.trim() !== '',
    staleTime: 60_000,
  });
}

export function useUserTrend(billingMonth: string | null, userId: string | null) {
  return useQuery({
    queryKey: ['user-trend', billingMonth, userId],
    queryFn: () => fetchUserTrend(billingMonth as string, userId as string),
    enabled:
      billingMonth !== null &&
      billingMonth.trim() !== '' &&
      userId !== null &&
      userId.trim() !== '',
    staleTime: 60_000,
  });
}

export function useKeys(billingMonth: string | null) {
  return useQuery({
    queryKey: ['keys', billingMonth],
    queryFn: () => fetchKeys(billingMonth as string),
    enabled: billingMonth !== null && billingMonth.trim() !== '',
    staleTime: 60_000,
  });
}

export function useKeyTrend(billingMonth: string | null, apiKeyId: string | null) {
  return useQuery({
    queryKey: ['key-trend', billingMonth, apiKeyId],
    queryFn: () => fetchKeyTrend(billingMonth as string, apiKeyId as string),
    enabled:
      billingMonth !== null &&
      billingMonth.trim() !== '' &&
      apiKeyId !== null &&
      apiKeyId.trim() !== '',
    staleTime: 60_000,
  });
}

export function useModels(billingMonth: string | null) {
  return useQuery({
    queryKey: ['models', billingMonth],
    queryFn: () => fetchModels(billingMonth as string),
    enabled: billingMonth !== null && billingMonth.trim() !== '',
    staleTime: 60_000,
  });
}

export function useCost(billingMonth: string | null) {
  return useQuery({
    queryKey: ['cost', billingMonth],
    queryFn: () => fetchCost(billingMonth as string),
    enabled: billingMonth !== null && billingMonth.trim() !== '',
    staleTime: 60_000,
  });
}

export function useSignals(billingMonth: string | null) {
  return useQuery({
    queryKey: ['signals', billingMonth],
    queryFn: () => fetchSignals(billingMonth as string),
    enabled: billingMonth !== null && billingMonth.trim() !== '',
    staleTime: 60_000,
  });
}
