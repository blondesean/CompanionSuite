import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  type QueryCommandInput,
} from '@aws-sdk/lib-dynamodb';
import type { Item, QueryOptions, Store } from './store';

export class DynamoStore implements Store {
  private doc = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
    marshallOptions: { removeUndefinedValues: true },
  });

  constructor(private table: string) {}

  async get<T extends object>(pk: string, sk: string) {
    const res = await this.doc.send(new GetCommand({ TableName: this.table, Key: { pk, sk } }));
    return res.Item as (T & Item) | undefined;
  }

  async query<T extends object>(pk: string, o: QueryOptions = {}) {
    const values: Record<string, unknown> = { ':pk': pk };
    let condition = 'pk = :pk';
    if (o.beginsWith !== undefined) {
      condition += ' AND begins_with(sk, :prefix)';
      values[':prefix'] = o.beginsWith;
    } else if (o.gte !== undefined && o.lte !== undefined) {
      condition += ' AND sk BETWEEN :gte AND :lte';
      values[':gte'] = o.gte;
      values[':lte'] = o.lte;
    } else if (o.gte !== undefined) {
      condition += ' AND sk >= :gte';
      values[':gte'] = o.gte;
    } else if (o.lte !== undefined) {
      condition += ' AND sk <= :lte';
      values[':lte'] = o.lte;
    }

    const input: QueryCommandInput = {
      TableName: this.table,
      KeyConditionExpression: condition,
      ExpressionAttributeValues: values,
      ScanIndexForward: !o.reverse,
    };

    const items: (T & Item)[] = [];
    let startKey: Record<string, unknown> | undefined;
    do {
      const res = await this.doc.send(
        new QueryCommand({
          ...input,
          ExclusiveStartKey: startKey,
          Limit: o.limit !== undefined ? o.limit - items.length : undefined,
        }),
      );
      items.push(...((res.Items ?? []) as (T & Item)[]));
      startKey = res.LastEvaluatedKey;
    } while (startKey && (o.limit === undefined || items.length < o.limit));
    return items;
  }

  async put(pk: string, sk: string, data: object) {
    await this.doc.send(new PutCommand({ TableName: this.table, Item: { ...data, pk, sk } }));
  }

  async delete(pk: string, sk: string) {
    await this.doc.send(new DeleteCommand({ TableName: this.table, Key: { pk, sk } }));
  }
}
