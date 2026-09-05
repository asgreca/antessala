import os
import glob
import pandas as pd
import numpy as np
import re

DATA_DIR = "/Users/macmini/apps/CGU/data"
EXTRACT_DIR = os.path.join(DATA_DIR, "extracted")
OUTPUT_PARQUET = os.path.join(DATA_DIR, "eagendas_consolidado_2023_2026.parquet")
OUTPUT_CSV = os.path.join(DATA_DIR, "eagendas_consolidado_2023_2026.csv")

def process_all_eagendas_csvs(start_year=2023):
    csv_files = sorted(glob.glob(os.path.join(EXTRACT_DIR, "*.csv")))
    print(f"Total de arquivos mensalidades no ZIP: {len(csv_files)}")

    # Filtra arquivos a partir de 2023 (ex: 2023-01.csv a 2026-08.csv)
    target_files = [f for f in csv_files if any(f.endswith(f"{y}-{m:02d}.csv") for y in range(start_year, 2027) for m in range(1, 13))]
    print(f"Arquivos selecionados a partir de {start_year}: {len(target_files)}")

    processed_chunks = []
    total_lines = 0

    for csv_file in target_files:
        filename = os.path.basename(csv_file)
        try:
            # Lê CSV do governo federal com vírgula e aspas
            df_chunk = pd.read_csv(
                csv_file,
                sep=',',
                quotechar='"',
                on_bad_lines='skip',
                low_memory=False,
                encoding='utf-8'
            )
            
            lines_count = len(df_chunk)
            total_lines += lines_count
            print(f"  &bull; Lendo {filename}: {lines_count:,} linhas")

            # Padroniza colunas
            df_chunk.columns = [c.strip() for c in df_chunk.columns]

            # Seleciona as colunas essenciais
            cols_map = {
                'ID do registro': 'event_id',
                'Nome': 'authority_name',
                'Cargo/Função': 'authority_role',
                'Órgão/Entidade': 'public_body',
                'Tipo de registro': 'event_type',
                'Data de início': 'date_start',
                'Hora de início': 'time_start',
                'Assunto do Compromisso': 'declared_topic',
                'Participantes': 'raw_participants',
                'Forma de realização': 'presence_type'
            }

            existing_cols = {k: v for k, v in cols_map.items() if k in df_chunk.columns}
            df_sub = df_chunk[list(existing_cols.keys())].rename(columns=existing_cols)
            
            processed_chunks.append(df_sub)
        except Exception as e:
            print(f"  ! Erro ao processar {filename}: {e}")

    if processed_chunks:
        df_master = pd.concat(processed_chunks, ignore_index=True)
        print(f"\n============================================================")
        print(f"🔥 SUCESSO! Total de Linhas Analisadas (2023-2026): {len(df_master):,} linhas!")
        print(f"============================================================")

        # Salva arquivo consolidado otimizado em CSV/Parquet
        df_master.to_csv(OUTPUT_CSV, index=False, sep=';', encoding='utf-8-sig')
        df_master.to_parquet(OUTPUT_PARQUET, index=False)
        print(f"DataFrame exportado para: {OUTPUT_CSV} e {OUTPUT_PARQUET}")
        return df_master
    else:
        print("Nenhum dado extraído.")
        return pd.DataFrame()

if __name__ == "__main__":
    process_all_eagendas_csvs(2023)
