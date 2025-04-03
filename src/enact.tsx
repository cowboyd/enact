import {
  call,
  createChannel,
  createContext,
  createScope,
  createSignal,
  each,
  type Operation,
  resource,
  spawn,
  Stream,
} from "effection";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

export interface EnactComponent<T> {
  (props: T): Operation<void>;
}

export interface ReactComponent<T> {
  (props: T): ReactNode;
}

export function* $(node: ReactNode): Operation<void> {
  let setContent = yield* RenderContext.expect();
  setContent(node);
}

const RenderContext = createContext<(node: ReactNode) => void>("enact.render");

export function enact<T>(component: EnactComponent<T>): ReactComponent<T> {
  return (props: T) => {
    let [content, setContent] = useState<ReactNode>(null);

    useEffect(() => {
      let [scope, destroy] = createScope();
      scope.set(RenderContext, setContent);
      scope.run(function* () {
        try {
          yield* component(props);
        } catch (e) {
          let error = e as Error;
          setContent(
            <>
              <h1>Component Crash</h1>
              <h3>{error?.message}</h3>
              <pre>{error?.stack}</pre>
            </>,
          );
        }
      });
      return () => {
        destroy;
      };
    }, []);

    return content;
  };
}

export interface Value<T> extends Computed<T> {
  current: T;
  set(value: T): void;
  is(value: T): Operation<boolean>;
}

export function useValue<T>(initial: T): Value<T> {
  let ref = { current: initial };
  let values = createSignal<T>();

  let set = (value: T) => {
    if (value !== ref.current) {
      ref.current = value;
      values.send(value);
    }
  };

  function is(value: T): Operation<boolean> {
    return call(function* () {
      if (value === ref.current) {
        return true;
      } else {
        for (let next of yield* each(values)) {
          if (next === value) {
            return true;
          }
          yield* each.next();
        }
        return false;
      }
    });
  }

  let computed = compute<T>(function* (emit) {
    yield* emit(ref.current);

    for (let value of yield* each(values)) {
      yield* emit(value);
      yield* each.next();
    }
  });

  return {
    get current() {
      return ref.current;
    },
    is,
    set,
    react: computed.react,
    [Symbol.iterator]: computed[Symbol.iterator],
  };
}

export interface Computed<T> extends Stream<T, never> {
  react: ReactComponent<Record<string | symbol, never>>;
}

export function compute<T>(
  body: (emit: (value: T) => Operation<void>) => Operation<void>,
): Computed<T> {
  let { send: emit, close: _close, ...stream } = createChannel<T, never>();
  let computed: Stream<T, never> = resource(function* (provide) {
    yield* spawn(() => body(emit));

    yield* provide(yield* stream);
  });
  
  let react = enact<Record<string, never>>(function* () {
    for (let value of yield* each(computed)) {
      yield* $(String(value));
      yield* each.next();
    }
  });
  
  return {
    react,
    [Symbol.iterator]: computed[Symbol.iterator],
  };
}
