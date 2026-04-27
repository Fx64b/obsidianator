import { useState, useCallback, useRef, useEffect, memo } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import {
	ChevronLeft,
	ChevronRight,
	ExternalLink,
	FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";

import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

// Use Vite's URL import to bundle the worker locally (no CDN required)
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

interface PdfViewerProps {
	src: string;
	title?: string;
}

export const PdfViewer = memo(function PdfViewer({
	src,
	title,
}: PdfViewerProps) {
	const [numPages, setNumPages] = useState(0);
	const [page, setPage] = useState(1);
	const [width, setWidth] = useState(600);
	const [pageHeight, setPageHeight] = useState<number | null>(null);
	const [error, setError] = useState(false);
	const containerRef = useRef<HTMLDivElement>(null);
	const timerRef = useRef<ReturnType<typeof setTimeout>>();
	const committedWidth = useRef(0);

	// Measure width once on mount, then only on window resize.
	// Using window resize (not ResizeObserver) avoids re-renders triggered by
	// the page scrollbar appearing/disappearing as the user scrolls.
	useEffect(() => {
		const measure = () => {
			const el = containerRef.current;
			if (!el) return;
			const newWidth = el.clientWidth;
			if (Math.abs(newWidth - committedWidth.current) > 10) {
				committedWidth.current = newWidth;
				setWidth(newWidth);
			}
		};

		measure();

		const onResize = () => {
			clearTimeout(timerRef.current);
			timerRef.current = setTimeout(measure, 100);
		};

		window.addEventListener("resize", onResize);
		return () => {
			window.removeEventListener("resize", onResize);
			clearTimeout(timerRef.current);
		};
	}, []);

	const onLoad = useCallback(({ numPages }: { numPages: number }) => {
		setNumPages(numPages);
		setPage(1);
		setError(false);
	}, []);

	const onPageRenderSuccess = useCallback((page: { height: number }) => {
		setPageHeight(page.height);
	}, []);

	const onError = useCallback(() => setError(true), []);

	const filename = title || src.split("/").pop() || "document.pdf";

	return (
		<div className="my-4 rounded-lg border border-border overflow-hidden">
			{/* Toolbar */}
			<div className="flex items-center gap-2 border-b border-border bg-muted/40 px-3 py-2">
				<FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
				<span className="flex-1 truncate text-xs text-muted-foreground">
					{filename}
				</span>

				{numPages > 0 && (
					<div className="flex items-center gap-1">
						<button
							type="button"
							onClick={() => setPage((p) => Math.max(1, p - 1))}
							disabled={page <= 1}
							className={cn(
								"rounded p-0.5 transition-colors",
								page <= 1
									? "text-muted-foreground/30 cursor-not-allowed"
									: "text-muted-foreground hover:text-foreground hover:bg-accent",
							)}
						>
							<ChevronLeft className="h-4 w-4" />
						</button>
						<span className="min-w-[3.5rem] text-center text-xs text-muted-foreground tabular-nums">
							{page} / {numPages}
						</span>
						<button
							type="button"
							onClick={() => setPage((p) => Math.min(numPages, p + 1))}
							disabled={page >= numPages}
							className={cn(
								"rounded p-0.5 transition-colors",
								page >= numPages
									? "text-muted-foreground/30 cursor-not-allowed"
									: "text-muted-foreground hover:text-foreground hover:bg-accent",
							)}
						>
							<ChevronRight className="h-4 w-4" />
						</button>
					</div>
				)}

				<a
					href={src}
					target="_blank"
					rel="noopener noreferrer"
					className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
				>
					<ExternalLink className="h-3.5 w-3.5" />
				</a>
			</div>

			{/* PDF canvas */}
			<div
				ref={containerRef}
				className="flex justify-center bg-muted/10 overflow-hidden"
			>
				{error ? (
					<div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
						Failed to load PDF —{" "}
						<a
							href={src}
							target="_blank"
							rel="noopener noreferrer"
							className="ml-1 underline hover:text-foreground"
						>
							open directly
						</a>
					</div>
				) : (
					<Document
						file={src}
						onLoadSuccess={onLoad}
						onLoadError={onError}
						loading={
							<div
								className="flex items-center justify-center text-sm text-muted-foreground"
								style={{ width: width || 600, height: pageHeight ?? 192 }}
							>
								Loading…
							</div>
						}
					>
						<Page
							pageNumber={page}
							width={width || 600}
							renderTextLayer
							renderAnnotationLayer
							onRenderSuccess={onPageRenderSuccess}
							loading={
								<div
									style={{ width: width || 600, height: pageHeight ?? 192 }}
								/>
							}
						/>
					</Document>
				)}
			</div>
		</div>
	);
});
