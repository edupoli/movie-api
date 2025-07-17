CREATE OR REPLACE FUNCTION update_all_programacao_status()
RETURNS VOID AS $$
BEGIN
    -- Atualiza para 'inativo' todos os registros cuja semana_fim está no passado
    UPDATE programacao 
    SET status = 'inativo'
    WHERE semana_fim < CURRENT_DATE;
    
    -- Atualiza para 'inativo' os que estão no período mas SEM programação válida
    UPDATE programacao 
    SET status = 'inativo'
    WHERE CURRENT_DATE BETWEEN semana_inicio AND semana_fim
    AND NOT (
        (segunda ~ '\d{2}/\d{2}/\d{4}\s+\d{2}:\d{2}\s+\([^)]+\)') OR
        (terca ~ '\d{2}/\d{2}/\d{4}\s+\d{2}:\d{2}\s+\([^)]+\)') OR
        (quarta ~ '\d{2}/\d{2}/\d{4}\s+\d{2}:\d{2}\s+\([^)]+\)') OR
        (quinta ~ '\d{2}/\d{2}/\d{4}\s+\d{2}:\d{2}\s+\([^)]+\)') OR
        (sexta ~ '\d{2}/\d{2}/\d{4}\s+\d{2}:\d{2}\s+\([^)]+\)') OR
        (sabado ~ '\d{2}/\d{2}/\d{4}\s+\d{2}:\d{2}\s+\([^)]+\)') OR
        (domingo ~ '\d{2}/\d{2}/\d{4}\s+\d{2}:\d{2}\s+\([^)]+\)')
    );
    
    -- Atualiza para 'em cartaz' os que estão no período e COM programação válida
    UPDATE programacao 
    SET status = 'em cartaz'
    WHERE CURRENT_DATE BETWEEN semana_inicio AND semana_fim
    AND (
        (segunda ~ '\d{2}/\d{2}/\d{4}\s+\d{2}:\d{2}\s+\([^)]+\)') OR
        (terca ~ '\d{2}/\d{2}/\d{4}\s+\d{2}:\d{2}\s+\([^)]+\)') OR
        (quarta ~ '\d{2}/\d{2}/\d{4}\s+\d{2}:\d{2}\s+\([^)]+\)') OR
        (quinta ~ '\d{2}/\d{2}/\d{4}\s+\d{2}:\d{2}\s+\([^)]+\)') OR
        (sexta ~ '\d{2}/\d{2}/\d{4}\s+\d{2}:\d{2}\s+\([^)]+\)') OR
        (sabado ~ '\d{2}/\d{2}/\d{4}\s+\d{2}:\d{2}\s+\([^)]+\)') OR
        (domingo ~ '\d{2}/\d{2}/\d{4}\s+\d{2}:\d{2}\s+\([^)]+\)')
    );
    
    -- Atualiza para 'pre venda' os com data_estreia no futuro e COM programação válida
    UPDATE programacao 
    SET status = 'pre venda'
    WHERE data_estreia > CURRENT_DATE
    AND (
        (segunda ~ '\d{2}/\d{2}/\d{4}\s+\d{2}:\d{2}\s+\([^)]+\)') OR
        (terca ~ '\d{2}/\d{2}/\d{4}\s+\d{2}:\d{2}\s+\([^)]+\)') OR
        (quarta ~ '\d{2}/\d{2}/\d{4}\s+\d{2}:\d{2}\s+\([^)]+\)') OR
        (quinta ~ '\d{2}/\d{2}/\d{4}\s+\d{2}:\d{2}\s+\([^)]+\)') OR
        (sexta ~ '\d{2}/\d{2}/\d{4}\s+\d{2}:\d{2}\s+\([^)]+\)') OR
        (sabado ~ '\d{2}/\d{2}/\d{4}\s+\d{2}:\d{2}\s+\([^)]+\)') OR
        (domingo ~ '\d{2}/\d{2}/\d{4}\s+\d{2}:\d{2}\s+\([^)]+\)')
    );
    
    -- Atualiza para 'em breve' os com data_estreia no futuro e SEM programação válida
    UPDATE programacao 
    SET status = 'em breve'
    WHERE data_estreia > CURRENT_DATE
    AND NOT (
        (segunda ~ '\d{2}/\d{2}/\d{4}\s+\d{2}:\d{2}\s+\([^)]+\)') OR
        (terca ~ '\d{2}/\d{2}/\d{4}\s+\d{2}:\d{2}\s+\([^)]+\)') OR
        (quarta ~ '\d{2}/\d{2}/\d{4}\s+\d{2}:\d{2}\s+\([^)]+\)') OR
        (quinta ~ '\d{2}/\d{2}/\d{4}\s+\d{2}:\d{2}\s+\([^)]+\)') OR
        (sexta ~ '\d{2}/\d{2}/\d{4}\s+\d{2}:\d{2}\s+\([^)]+\)') OR
        (sabado ~ '\d{2}/\d{2}/\d{4}\s+\d{2}:\d{2}\s+\([^)]+\)') OR
        (domingo ~ '\d{2}/\d{2}/\d{4}\s+\d{2}:\d{2}\s+\([^)]+\)')
    );
END;
$$ LANGUAGE plpgsql;