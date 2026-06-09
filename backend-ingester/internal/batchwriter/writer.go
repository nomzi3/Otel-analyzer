package batchwriter

import (
	"context"
	"log"
	"sync"
	"time"
)

// Writer accumulates rows and flushes when either maxSize rows are buffered
// or maxWait has elapsed since the last flush, whichever comes first.
type Writer[T any] struct {
	mu      sync.Mutex
	buf     []T
	maxSize int
	maxWait time.Duration
	flushFn func(ctx context.Context, rows []T) error

	timer    *time.Timer
	stopOnce sync.Once
	stopCh   chan struct{}
	wg       sync.WaitGroup
}

func New[T any](maxSize int, maxWait time.Duration, flushFn func(ctx context.Context, rows []T) error) *Writer[T] {
	w := &Writer[T]{
		buf:     make([]T, 0, maxSize),
		maxSize: maxSize,
		maxWait: maxWait,
		flushFn: flushFn,
		stopCh:  make(chan struct{}),
	}
	w.timer = time.AfterFunc(maxWait, func() {
		w.flushLocked(context.Background())
	})
	return w
}

// Add appends rows to the buffer and triggers a synchronous flush if the
// size threshold is reached.
func (w *Writer[T]) Add(ctx context.Context, rows []T) {
	w.mu.Lock()
	w.buf = append(w.buf, rows...)
	if len(w.buf) >= w.maxSize {
		w.flushLocked(ctx)
	}
	w.mu.Unlock()
}

// flushLocked drains the buffer and calls flushFn. Caller must hold w.mu.
func (w *Writer[T]) flushLocked(ctx context.Context) {
	if len(w.buf) == 0 {
		return
	}
	batch := w.buf
	w.buf = make([]T, 0, w.maxSize)
	w.timer.Reset(w.maxWait)

	w.wg.Add(1)
	go func() {
		defer w.wg.Done()
		if err := w.flushFn(ctx, batch); err != nil {
			log.Printf("batchwriter flush error: %v", err)
		}
	}()
}

// Stop flushes any remaining rows and waits for all in-flight flushes to complete.
func (w *Writer[T]) Stop(ctx context.Context) {
	w.stopOnce.Do(func() {
		w.timer.Stop()
		close(w.stopCh)
	})
	w.mu.Lock()
	w.flushLocked(ctx)
	w.mu.Unlock()
	w.wg.Wait()
}
