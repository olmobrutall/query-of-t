import { Quoted } from "quote-transformer/quoted";
import { Query } from "../query";
import { table } from "../table";

export interface Lite<T> {
    type: Function;
}

export abstract class Entity {

    // static implement<T, M extends keyof T, R>(this: { new(): T }, methodName: M, quoted: Quoted<(this: T) =>  GetReturnType<T[M]>) {
    //     this.prototype.
    // }

}

// type GetReturnType<T> = T extends (...args: any) => infer R ? R : never;


export class UserEntity extends Entity {

    orders(): Query<OrderEntity> =

}

export class OrderEntity extends Entity {
    user: UserEntity = null!;
}

export interface UserEntity {
    orders(): Query<OrderEntity>;
}


UserEntity.implement("orders", () => table(OrderEntity).filter(o => o.user == this));



registerExpression(UserEntity, "orders",)
