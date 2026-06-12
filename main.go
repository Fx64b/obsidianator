package main

import (
	"embed"
	"fmt"
	"os"
	"time"

	"github.com/Fx64b/obsidianator/internal/export"
	"github.com/Fx64b/obsidianator/internal/vault"
	"github.com/spf13/cobra"
)

const version = "0.1.0" // x-release-please-version

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

		parseVault := makeFilteredParser(includes)

		fmt.Printf("Parsing vault: %s\n", vaultPath)
		t0 := time.Now()
		data, err := parseVault(vaultPath)
		if err != nil {
			return fmt.Errorf("parsing vault: %w", err)
		}
		if len(includes) > 0 {
			fmt.Printf("Include filter: %v\n", includes)
		}
		fmt.Printf("Found %d notes · %d folders · %d tags · %d edges · %d attachments (parsed in %s)\n",
			len(data.Notes), len(data.Folders), len(data.Tags), len(data.Edges), len(data.Attachments),
			time.Since(t0).Round(time.Millisecond))

		fmt.Printf("Exporting to: %s\n", outputDir)
		t1 := time.Now()
		if err := export.Export(data, vaultPath, outputDir, staticFS); err != nil {
			return fmt.Errorf("exporting: %w", err)
		}
		fmt.Printf("Export complete in %s.\n", time.Since(t1).Round(time.Millisecond))

		if watch {
			return export.Watch(vaultPath, outputDir, host, port, staticFS, parseVault)
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

		if len(includes) > 0 {
			fmt.Printf("Include filter: %v\n", includes)
		}
		fmt.Printf("Parsing vault: %s\n", vaultPath)
		return export.ServeInMemory(vaultPath, host, port, watch, staticFS, makeFilteredParser(includes))
	},
}

// makeFilteredParser returns a ParseVault-compatible function that applies
// the given include filter after parsing. If includes is empty the full vault is returned.
func makeFilteredParser(includes []string) func(string) (*vault.VaultData, error) {
	return func(path string) (*vault.VaultData, error) {
		data, err := vault.ParseVault(path)
		if err != nil {
			return nil, err
		}
		filtered := vault.FilterVaultData(data, includes)
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
	rootCmd.AddCommand(exportCmd)

	serveCmd.Flags().String("host", "127.0.0.1", "Address to bind to (use 0.0.0.0 to expose on the network)")
	serveCmd.Flags().Int("port", 3000, "Port to serve on")
	serveCmd.Flags().BoolP("watch", "w", false, "Watch vault for changes and live-reload")
	serveCmd.Flags().StringArray("include", nil, "Include only specific files or folders (repeatable, e.g. --include Notes --include Diary/2024.md)")
	rootCmd.AddCommand(serveCmd)
}

func main() {
	if err := rootCmd.Execute(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
