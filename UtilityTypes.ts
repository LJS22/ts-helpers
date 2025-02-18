// Prettify flattens TypeScript's type output, making it easier to read.
type Prettify<TObj> = {
    [TKey in keyof TObj]: TObj[TKey];
} & {};

// Merge combines two types, overriding properties from the second type.
type Merge<TObj1, TObj2> = Prettify<Omit<TObj1, keyof TObj2> & TObj2>;

// MergeArrayOfObjects merges an array of object types into a single object type.
type MergeArrayOfObjects<TArr extends readonly object[], TAccumulator = {}> = TArr extends [
    infer TInitialValue extends object,
    ...infer TRest extends object[]
] ? MergeArrayOfObjects<TRest, Merge<TAccumulator, TInitialValue>> : TAccumulator;

// UnionOfObjectKeys generates a union type of the keys of an object that match the type of TMatch.
type UnionOfObjectKeys<
    TObj,
    TMatch,
    ExtractedKeys extends keyof TObj = Extract<
        keyof TObj, 
        TMatch
    >
> = {
    [K in ExtractedKeys]: K
}[ExtractedKeys]

// UnionOfObjectValues generates a union type of the values of an object that have a key matching the type of TMatch.
type UnionOfObjectValues<
    TObj,
    TMatch,
    ExtractedKeys extends keyof TObj = Extract<
        keyof TObj, 
        TMatch
    >
> = {
    [K in ExtractedKeys]: TObj[K]
}[ExtractedKeys]

// DeepRemoveFieldsByType generates an object type matching TObj without the properties where the value is of type TMatch.
type DeepRemoveFieldsByType<TObj, TMatch> = {
    [TKey in keyof TObj]: TObj[TKey] extends TMatch 
        ? never 
        : TObj[TKey] extends object 
        ? DeepRemoveFieldsByType<TObj[TKey], TMatch> 
        : TObj[TKey];
} extends infer TCurrent 
    ? 
    { 
        [
            TKey1 in keyof TCurrent as TCurrent[TKey1] extends never 
            ? never 
            : TKey1
        ]: TCurrent[TKey1] 
    } : never;

// DeepRemoveFieldsByKey recursively removes fields from an object of type TObj if the key matches the type of TMatch.
type DeepRemoveFieldsByKey<TObj, TMatch extends string> = {
    [
        TKey in keyof TObj as TKey extends TMatch 
        ? never 
        : TKey
    ]: TObj[TKey] extends object 
        ? DeepRemoveFieldsByKey<TObj[TKey], TMatch> 
        : TObj[TKey];
} extends infer TCurrent 
    ? { [TKey1 in keyof TCurrent]: TCurrent[TKey1] } 
    : never;

// DeepPartial sets every field within T to optional, recursively.
type DeepPartial<T> = Readonly<{
    [K in keyof T]?: T[K] extends (number | string | symbol) 
    ? T[K]
    : T[K] extends Array<infer A> ? Array<DeepPartial<A>>
    : DeepPartial<T[K]>;
}>

// RequiredTypes generates an object type with only the required fields of TObj.
type RequiredTypes<TObj> = {
    [TKey in keyof TObj]-?: {} extends Pick<TObj, TKey> 
        ? never : TObj[TKey] extends object 
            ? RequiredTypes<TObj[TKey]> : TKey
}[keyof TObj]

// OptionalTypes generates an object type with only the optional fields of TObj.
type OptionalTypes<TObj> = {
    [TKey in keyof TObj]-?: {} extends Pick<TObj, TKey> 
        ? TKey : TObj[TKey] extends object 
            ? RequiredTypes<TObj[TKey]> : never
}[keyof TObj]

// TupleToObject generates an object type from a tuple, where the keys and values match that of the tuple values.
type TupleToObject<TTuple extends readonly any[]> = {
  [TIndex in TTuple[number]]: TIndex
}

// FirstOf extracts the first type from a tuple.
type FirstOf<TTuple extends any[]> = TTuple extends [infer TFirst, ...any[]] ? TFirst : never
