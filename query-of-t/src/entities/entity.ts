import { Quoted } from "quote-transformer/lib/quoted";
import { Query } from "../query";
import { table } from "../table";

export interface Lite<T> {
    type: Function;
}

export abstract class Entity {

    static implement<T, M extends keyof T, R>(this: { new(): T }, methodName: M, quoted: Quoted<(this: T) =>  GetReturnType<T[M]>) {
        this.prototype.
    }

}

type GetReturnType<T> = T extends (...args: any) => infer R ? R : never;


export class UserEntity extends Entity {
    orders2(): Query<OrderEntity>;

}

export class OrderEntity extends Entity {
    user: UserEntity;
}

export interface UserEntity {
    orders(): Query<OrderEntity>;
}


UserEntity.implement("orders", () => table(OrderEntity).filter(o => o.user == this));



registerExpression(UserEntity, "orders",)
UserEntity.prototype.orders = function (this: UserEntity) {

}
