import { quoted } from "query-of-t/dist/query"
import { field } from "query-of-t/dist/reflection"
import { table } from "query-of-t/dist/table"
import { Query } from "query-of-t/dist/query"
import { Entity } from "query-of-t/dist/entities/entity";

console.log("Hi");

export class Order extends Entity {

    @field id: number;
    @field amount: number;
    @field creationDate: Date;

    @quoted()
    lines(): Query<OrderLine> {
        return table(OrderLine).filter(ol => ol.orderId == this.id);
    }
}

export class OrderLine extends Entity {

    @field id: number;
    @field orderId: number;
    @field productId: number;
    @field quantity: number;
    @field unitPrice: number;

    @quoted()
    order(): Order {
        return table(Order).single(o => o.id == this.orderId);
    }

    @quoted()
    product(): Product {
        return table(Product).single(p => p.id == this.productId);
    }
}

export class Product extends Entity {

    @field id: number;
    @field name: string;
    @field description: string;
    @field discontinued: boolean;
    @field unitPrice: number;

    @quoted()
    lines(): Query<OrderLine> {
        return table(OrderLine).filter(ol => ol.productId == this.id);
    }
}

var obj: { name: string } | undefined = undefined


var order2 = table(Order)
    .filter(o => o.lines().some(a => a.unitPrice != a.product().unitPrice))
    .toArray();

var orders = table(Order).filter(o => o.amount > (obj?.name.length ?? 15)).toArray();

