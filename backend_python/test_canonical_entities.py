"""Testes unitários e de integração para a unificação e canonicalização de entidades.

Verifica a integridade do catálogo, regras de compatibilidade de nomes,
prevenção de falsos positivos (ex: Cielo vs PicPay, Vale vs Valec) e a
consolidação das reuniões no DuckDB (ex: Claudia Vasconcellos -> Petrobras).
"""
import unittest
import duckdb

from saril.entity_canonical import (
    CANONICAL_ENTITIES_CATALOG,
    build_catalog_indices,
    build_canonical_mapping_df,
    extract_core_tokens,
    names_are_compatible,
    unify_canonical_entities,
)


class TestCanonicalEntities(unittest.TestCase):

    def test_catalog_integrity(self):
        """Verifica se todas as entradas do catálogo canônico são válidas e consistentes."""
        self.assertGreaterEqual(len(CANONICAL_ENTITIES_CATALOG), 50)
        norms = set()
        for item in CANONICAL_ENTITIES_CATALOG:
            norm, name, cnpj, aliases = item
            self.assertGreaterEqual(len(norm), 2, f"Norm inválida: {norm}")
            self.assertGreaterEqual(len(name), 2, f"Name inválido: {name}")
            if cnpj:
                self.assertEqual(len(cnpj), 14, f"CNPJ inválido: {cnpj} para {norm}")
                self.assertTrue(cnpj.isdigit(), f"CNPJ não-numérico: {cnpj} para {norm}")
            self.assertIsInstance(aliases, list)
            self.assertGreaterEqual(len(aliases), 1)
            self.assertNotIn(norm, norms, f"Norm duplicada no catálogo: {norm}")
            norms.add(norm)

    def test_catalog_indices(self):
        """Verifica se os índices de busca por alias, CNPJ e raiz de CNPJ funcionam corretamente."""
        alias_map, cnpj_map, root_cnpj_map = build_catalog_indices()
        self.assertIn("petrobras", alias_map)
        self.assertIn("petroleo brasileiro s a petrobras", alias_map)
        self.assertEqual(alias_map["petroleo brasileiro s a petrobras"][0], "petrobras")
        self.assertEqual(alias_map["petroleo brasileiro s a petrobras"][1], "Petrobras")

        # CNPJ da Petrobras
        self.assertIn("33000167000101", cnpj_map)
        self.assertEqual(cnpj_map["33000167000101"][0], "petrobras")

        # Raiz de CNPJ (8 dígitos) da ANBIMA e Petrobras
        self.assertIn("34271171", root_cnpj_map)
        self.assertEqual(root_cnpj_map["34271171"][0], "anbima")
        self.assertEqual(root_cnpj_map["34271171"][1], "ANBIMA")
        self.assertIn("33000167", root_cnpj_map)

        # Telefônica / Vivo
        self.assertIn("vivo", alias_map)
        self.assertIn("telefonica", alias_map)
        self.assertEqual(alias_map["vivo"][0], "telefonica vivo")
        self.assertEqual(alias_map["telefonica"][0], "telefonica vivo")

    def test_name_compatibility_safety(self):
        """Verifica se a função names_are_compatible distingue empresas diferentes e une variações legítimas."""
        # Variações legítimas que DEVEM unir
        self.assertTrue(names_are_compatible("arteris", "aretris"))
        self.assertTrue(names_are_compatible("vli logistica", "vli multimodal"))
        self.assertTrue(names_are_compatible("empresa epr", "epr"))
        self.assertTrue(names_are_compatible("claro", "claro empresas"))
        self.assertTrue(names_are_compatible("vale", "vale holdings"))
        self.assertTrue(names_are_compatible("pinheiro neto advogados", "pinheiro neto"))
        self.assertTrue(names_are_compatible("rumo", "rumo logistica"))

        # Empresas distintas que NÃO DEVEM unir mesmo com palavras de negócio parecidas
        self.assertFalse(names_are_compatible(
            "cielo s a instituicao de pagamento",
            "picpay instituicao de pagamento",
        ))
        self.assertFalse(names_are_compatible("vale", "valec"))

    def test_claudia_vasconcellos_single_entity(self):
        """Verifica se na base saril_serving.duckdb a representante Claudia Vasconcellos tem exatamente 1 entidade (Petrobras)."""
        con = duckdb.connect("data/saril_serving.duckdb", read_only=True)
        rows = con.execute("""
            SELECT entity_norm, entity_name, entity_cnpj, count(*)
            FROM meetings
            WHERE lobbyist_name ILIKE '%CLAUDIA VASCONCELLOS%'
            GROUP BY 1, 2, 3
        """).fetchall()

        self.assertEqual(len(rows), 1, f"Claudia possui mais de uma entidade após unificação: {rows}")
        norm, name, cnpj, count = rows[0]
        self.assertEqual(norm, "petrobras")
        self.assertEqual(name, "Petrobras")
        self.assertEqual(cnpj, "33000167000101")
        self.assertGreaterEqual(count, 400, f"Contagem esperada >= 400 reuniões, obtido: {count}")

    def test_petrobras_canonical_in_entities(self):
        """Verifica se na tabela entities existe apenas 'petrobras' e não o duplicado 'petroleo brasileiro s a petrobras'."""
        con = duckdb.connect("data/saril_serving.duckdb", read_only=True)
        duplicate = con.execute("""
            SELECT * FROM entities WHERE entity_norm = 'petroleo brasileiro s a petrobras'
        """).fetchall()
        self.assertEqual(len(duplicate), 0, f"Entidade duplicada ainda existe na tabela entities: {duplicate}")

        petro = con.execute("""
            SELECT display_name, cnpj, meetings_count FROM entities WHERE entity_norm = 'petrobras'
        """).fetchall()
        self.assertEqual(len(petro), 1)
        self.assertEqual(petro[0][0], "Petrobras")
        self.assertEqual(petro[0][1], "33000167000101")
        self.assertGreaterEqual(petro[0][2], 27000, f"Petrobras consolidada deve ter >= 27k reuniões, obteve {petro[0][2]}")


if __name__ == "__main__":
    unittest.main()
