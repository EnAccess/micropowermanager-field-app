import { AgentTransaction } from '@/api/agent';

export function buildTransactionDetailHref(transaction: AgentTransaction) {
  const personName = `${transaction.person?.name ?? ''} ${
    transaction.person?.surname ?? ''
  }`.trim();
  return {
    pathname: '/(app)/payments/[id]' as const,
    params: {
      id: String(transaction.id),
      amount: String(transaction.amount),
      message: transaction.message,
      sender: transaction.sender,
      type: transaction.type,
      created_at: transaction.created_at,
      payment_type: transaction.payment_type ?? '',
      device_type: transaction.device_type ?? '',
      person_id: transaction.person?.id ? String(transaction.person.id) : '',
      person_name: personName,
    },
  };
}
