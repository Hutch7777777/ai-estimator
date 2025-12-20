// Generic undo/redo hook using command pattern
// Provides history tracking with keyboard shortcuts

import { useState, useCallback, useEffect, useRef } from "react";

export interface UseHistoryOptions<T> {
  initialState: T;
  maxHistory?: number;
}

export interface UseHistoryReturn<T> {
  state: T;
  setState: (newState: T | ((prev: T) => T)) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  clear: () => void;
}

const DEFAULT_MAX_HISTORY = 50;

export function useHistory<T>(options: UseHistoryOptions<T>): UseHistoryReturn<T> {
  const { initialState, maxHistory = DEFAULT_MAX_HISTORY } = options;

  // Current state
  const [state, setStateInternal] = useState<T>(initialState);

  // History stacks
  const [past, setPast] = useState<T[]>([]);
  const [future, setFuture] = useState<T[]>([]);

  // Ref to track if we're in an undo/redo operation (to prevent adding to history)
  const isUndoRedoRef = useRef(false);

  // Computed values
  const canUndo = past.length > 0;
  const canRedo = future.length > 0;

  // Set state and add to history
  const setState = useCallback(
    (newState: T | ((prev: T) => T)) => {
      setStateInternal((currentState) => {
        const nextState =
          typeof newState === "function"
            ? (newState as (prev: T) => T)(currentState)
            : newState;

        // Only add to history if not in undo/redo operation
        if (!isUndoRedoRef.current) {
          // Push current state to past, respecting max history
          setPast((prevPast) => {
            const newPast = [...prevPast, currentState];
            // Trim if exceeds max
            if (newPast.length > maxHistory) {
              return newPast.slice(-maxHistory);
            }
            return newPast;
          });

          // Clear future on new state change
          setFuture([]);
        }

        return nextState;
      });
    },
    [maxHistory]
  );

  // Undo - go back one state
  const undo = useCallback(() => {
    if (!canUndo) return;

    setPast((prevPast) => {
      const newPast = [...prevPast];
      const previousState = newPast.pop();

      if (previousState !== undefined) {
        // Push current state to future
        setFuture((prevFuture) => [state, ...prevFuture]);

        // Set the previous state
        isUndoRedoRef.current = true;
        setStateInternal(previousState);
        // Reset flag after state update
        setTimeout(() => {
          isUndoRedoRef.current = false;
        }, 0);
      }

      return newPast;
    });
  }, [canUndo, state]);

  // Redo - go forward one state
  const redo = useCallback(() => {
    if (!canRedo) return;

    setFuture((prevFuture) => {
      const newFuture = [...prevFuture];
      const nextState = newFuture.shift();

      if (nextState !== undefined) {
        // Push current state to past
        setPast((prevPast) => [...prevPast, state]);

        // Set the next state
        isUndoRedoRef.current = true;
        setStateInternal(nextState);
        // Reset flag after state update
        setTimeout(() => {
          isUndoRedoRef.current = false;
        }, 0);
      }

      return newFuture;
    });
  }, [canRedo, state]);

  // Clear all history
  const clear = useCallback(() => {
    setPast([]);
    setFuture([]);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check if user is typing in an input/textarea
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }

      const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
      const modifierKey = isMac ? e.metaKey : e.ctrlKey;

      if (modifierKey && e.key === "z") {
        if (e.shiftKey) {
          // Ctrl/Cmd + Shift + Z = Redo
          e.preventDefault();
          redo();
        } else {
          // Ctrl/Cmd + Z = Undo
          e.preventDefault();
          undo();
        }
      } else if (modifierKey && e.key === "y") {
        // Ctrl/Cmd + Y = Redo (Windows style)
        e.preventDefault();
        redo();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [undo, redo]);

  return {
    state,
    setState,
    undo,
    redo,
    canUndo,
    canRedo,
    clear,
  };
}
