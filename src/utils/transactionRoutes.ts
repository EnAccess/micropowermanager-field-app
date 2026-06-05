import { AgentTransaction } from '@/api/agent';
import {
  transactionApplianceName,
  transactionPerson,
  transactionSerial,
} from '@/utils/transactionDisplay';

export function buildTransactionDetailHref(transaction: AgentTransaction) {
  const person = transactionPerson(transaction);
  const personName = `${person?.name ?? ''} ${person?.surname ?? ''}`.trim();
  return {
    pathname: '/(app)/payments/[id]' as const,
    params: {
      id: String(transaction.id),
      amount: String(transaction.amount),
      message: transaction.message,
      serial: transactionSerial(transaction) ?? '',
      appliance_name: transactionApplianceName(transaction) ?? '',
      sender: transaction.sender,
      type: transaction.type,
      created_at: transaction.created_at,
      payment_type: transaction.payment_type ?? '',
      device_type: transaction.device_type ?? '',
      person_id: person?.id ? String(person.id) : '',
      person_name: personName,
    },
  };
}
