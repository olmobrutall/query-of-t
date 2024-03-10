import { column, quoted } from "query-of-t/dist/decorators"
import { Entity, table } from "query-of-t/dist/table"

export class Order extends Entity {

    @column()
    id: number;
    @column()
    amount: number;
    @column()
    creationDate: Date;


    @quoted()
    lines = () => table(OrderLine).filter(ol => ol.orderId == this.id);
}


export class OrderLine extends Entity {

    @column()
    id: number;
    @column()
    orderId: number;
    @column()
    productId: number;
    @column()
    quantity: number;
    @column()
    unitPrice: number;

    @quoted()
    order = () => table(Order).single(o => o.id == this.orderId);

    @quoted()
    product = () => table(Product).single(p => p.id == this.productId);

}

export class Product extends Entity {

    @column()
    id: number;
    @column()
    name: string;
    @column()
    description: string;
    @column()
    discontinued: boolean;
    @column()
    unitPrice: number;

    @quoted()
    lines = () => table(OrderLine).filter(ol => ol.productId == this.id);
}

var obj: { name: string } | undefined = undefined


var order2 = table(Order)
    .filter(o => o.lines().some(a => a.unitPrice != a.product().unitPrice))
    .toArray();

var orders = table(Order).filter(o => o.amount > (obj?.name.length ?? 15)).toArray();

