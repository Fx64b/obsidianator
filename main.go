package main

import (
	"embed"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/Fx64b/obsidianator/internal/export"
	"github.com/Fx64b/obsidianator/internal/vault"
	"github.com/spf13/cobra"
)

const version = "0.2.1" // x-release-please-version

//go:embed static
var staticFS embed.FS

var rootCmd = &cobra.Command{
	Use:     "obsidianator",
	Short:   "Export your Obsidian vault to a self-contained static website",
	Version: version,
	CompletionOptions: cobra.CompletionOptions{
		DisableDefaultCmd: true,
	},
}

var exportCmd = &cobra.Command{
	Use:   "export <vault-path>",
	Short: "Export an Obsidian vault to a static site",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		vaultPath := args[0]
		outputDir, _ := cmd.Flags().GetString("output")
		serve, _ := cmd.Flags().GetBool("serve")
		watch, _ := cmd.Flags().GetBool("watch")
		host, _ := cmd.Flags().GetString("host")
		port, _ := cmd.Flags().GetInt("port")
		includes, _ := cmd.Flags().GetStringArray("include")
		publishedOnly, _ := cmd.Flags().GetBool("published-only")
		baseURL, _ := cmd.Flags().GetString("base-url")
		feed, _ := cmd.Flags().GetBool("feed")
		chunked, _ := cmd.Flags().GetBool("chunked")
		password, _ := cmd.Flags().GetString("password")

		baseURL = strings.TrimRight(baseURL, "/")
		if feed && baseURL == "" {
			return fmt.Errorf("--feed requires --base-url (feeds need absolute URLs)")
		}
		if password != "" {
			if chunked {
				return fmt.Errorf("--password cannot be combined with --chunked")
			}
			if baseURL != "" || feed {
				return fmt.Errorf("--password cannot be combined with --base-url/--feed: SEO pages would expose plaintext")
			}
		}
		seo := export.SEOOptions{
			BaseURL:  baseURL,
			Feed:     feed,
			Chunked:  chunked,
			Password: password,
		}

		parseVault := makeFilteredParser(includes, publishedOnly)

		fmt.Printf("Parsing vault: %s\n", vaultPath)
		t0 := time.Now()
		data, err := parseVault(vaultPath)
		if err != nil {
			return fmt.Errorf("parsing vault: %w", err)
		}
		if len(includes) > 0 {
			fmt.Printf("Include filter: %v\n", includes)
		}
		if publishedOnly {
			fmt.Printf("Publishing only notes with publish: true frontmatter\n")
		}
		fmt.Printf("Found %d notes · %d folders · %d tags · %d edges · %d attachments (parsed in %s)\n",
			len(data.Notes), len(data.Folders), len(data.Tags), len(data.Edges), len(data.Attachments),
			time.Since(t0).Round(time.Millisecond))

		fmt.Printf("Exporting to: %s\n", outputDir)
		t1 := time.Now()
		if err := export.Export(data, vaultPath, outputDir, staticFS, seo); err != nil {
			return fmt.Errorf("exporting: %w", err)
		}
		fmt.Printf("Export complete in %s.\n", time.Since(t1).Round(time.Millisecond))

		if watch {
			return export.Watch(vaultPath, outputDir, host, port, staticFS, parseVault, seo)
		}
		if serve {
			return export.Serve(outputDir, host, port)
		}
		return nil
	},
}

var serveCmd = &cobra.Command{
	Use:   "serve <vault-path>",
	Short: "Serve an Obsidian vault directly in-browser without exporting to disk",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		vaultPath := args[0]
		host, _ := cmd.Flags().GetString("host")
		port, _ := cmd.Flags().GetInt("port")
		watch, _ := cmd.Flags().GetBool("watch")
		includes, _ := cmd.Flags().GetStringArray("include")
		publishedOnly, _ := cmd.Flags().GetBool("published-only")

		if len(includes) > 0 {
			fmt.Printf("Include filter: %v\n", includes)
		}
		if publishedOnly {
			fmt.Printf("Serving only notes with publish: true frontmatter\n")
		}
		fmt.Printf("Parsing vault: %s\n", vaultPath)
		return export.ServeInMemory(vaultPath, host, port, watch, staticFS, makeFilteredParser(includes, publishedOnly))
	},
}

// makeFilteredParser returns a ParseVault-compatible function that applies
// the include filter and (optionally) the publish: true gate after parsing.
func makeFilteredParser(includes []string, publishedOnly bool) func(string) (*vault.VaultData, error) {
	return func(path string) (*vault.VaultData, error) {
		data, err := vault.ParseVault(path)
		if err != nil {
			return nil, err
		}
		filtered := vault.FilterVaultData(data, includes)
		if publishedOnly {
			filtered = vault.FilterPublished(filtered)
		}
		filtered.AppVersion = version
		return filtered, nil
	}
}

func init() {
	exportCmd.Flags().StringP("output", "o", "./dist", "Output directory")
	exportCmd.Flags().Bool("serve", false, "Serve the output directory after export")
	exportCmd.Flags().BoolP("watch", "w", false, "Watch vault for changes and live-reload (implies --serve)")
	exportCmd.Flags().String("host", "127.0.0.1", "Address to bind to (use 0.0.0.0 to expose on the network; used with --serve or --watch)")
	exportCmd.Flags().Int("port", 3000, "Port to serve on (used with --serve or --watch)")
	exportCmd.Flags().StringArray("include", nil, "Include only specific files or folders (repeatable, e.g. --include Notes --include Diary/2024.md)")
	exportCmd.Flags().Bool("published-only", false, "Export only notes with publish: true frontmatter (links to unpublished notes are stripped)")
	exportCmd.Flags().String("base-url", "", "Absolute URL the site will be hosted at (e.g. https://notes.example.com); enables canonical URLs, sitemap.xml and robots.txt")
	exportCmd.Flags().Bool("feed", false, "Write an RSS feed.xml of the most recently created notes (requires --base-url)")
	exportCmd.Flags().Bool("chunked", false, "Split vault-data.json into a metadata index plus per-note content chunks (for large vaults)")
	exportCmd.Flags().String("password", "", "Encrypt the exported vault so it can only be read after entering this password in the browser (client-side AES-256-GCM)")
	rootCmd.AddCommand(exportCmd)

	serveCmd.Flags().String("host", "127.0.0.1", "Address to bind to (use 0.0.0.0 to expose on the network)")
	serveCmd.Flags().Int("port", 3000, "Port to serve on")
	serveCmd.Flags().BoolP("watch", "w", false, "Watch vault for changes and live-reload")
	serveCmd.Flags().StringArray("include", nil, "Include only specific files or folders (repeatable, e.g. --include Notes --include Diary/2024.md)")
	serveCmd.Flags().Bool("published-only", false, "Serve only notes with publish: true frontmatter (preview of --published-only exports)")
	rootCmd.AddCommand(serveCmd)
}

func main() {
	if err := rootCmd.Execute(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
