import type { ModifiableEntity } from './modifiable';
import { getOrCreateTypeInfo } from '../reflection';

const mixinDeclarationsKey = Symbol.for('query-of-t:mixinDeclarations');

const symbolWithMetadata = Symbol as any;
if (symbolWithMetadata.metadata == null) {
    symbolWithMetadata.metadata = Symbol.for('Symbol.metadata');
}
const metadataSymbol: symbol = symbolWithMetadata.metadata;

export namespace MixinDeclarations {
    export function register<T extends ModifiableEntity, M>(
        target: new () => T,
        mixin: new () => M,
    ): void {
        const metadata = (target as any)[metadataSymbol];
        if (metadata == null) return;
        const mixins: (new () => unknown)[] = metadata[mixinDeclarationsKey] ?? [];
        mixins.push(mixin);
        metadata[mixinDeclarationsKey] = mixins;
    }

    export function getMixins(target: new () => ModifiableEntity): (new () => unknown)[] {
        const metadata = (target as any)[metadataSymbol];
        return metadata?.[mixinDeclarationsKey] ?? [];
    }
}

export function mixin(target: new () => ModifiableEntity) {
    return function (mixinClass: new () => unknown): void {
        MixinDeclarations.register(target, mixinClass);
    };
}
