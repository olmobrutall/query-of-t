
import { field } from "./reflection";
import { Entity } from "./entity";

export class UserEntity extends Entity {
    @field name: string;
    @field email: string;
    @field passwordHash: string;
}
