import { Quoted } from "quote-transformer/quoted";
import { Query } from "../query";
import { table } from "../table";
import { field } from "../reflection";

export interface Lite<T> {
    type: Function;
}

type PrimaryKey = string | number;

export abstract class Entity {
    @field id: PrimaryKey;
}