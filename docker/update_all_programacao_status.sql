CREATE OR REPLACE FUNCTION update_all_programacao_status()
RETURNS VOID AS $$
DECLARE
    v_record RECORD;
    v_data_estreia TIMESTAMP;
    v_schedule_exists BOOLEAN;
BEGIN
    FOR v_record IN SELECT p.*, f.data_estreia 
                    FROM programacao p 
                    JOIN filmes f ON p.id_filme = f.id 
    LOOP
        IF v_record.data_estreia IS NULL THEN
            UPDATE programacao 
            SET status = 'em breve' 
            WHERE id = v_record.id;
        ELSIF v_record.data_estreia::DATE BETWEEN v_record.semana_inicio AND v_record.semana_fim THEN
            UPDATE programacao 
            SET status = 'em cartaz' 
            WHERE id = v_record.id;
        ELSIF v_record.data_estreia::DATE < v_record.semana_inicio THEN
            UPDATE programacao 
            SET status = 'inativo' 
            WHERE id = v_record.id;
        ELSIF v_record.data_estreia::DATE > v_record.semana_fim THEN
            SELECT COALESCE(v_record.segunda, v_record.terca, v_record.quarta,
                           v_record.quinta, v_record.sexta, v_record.sabado,
                           v_record.domingo) IS NOT NULL
            INTO v_schedule_exists;
            
            IF v_schedule_exists THEN
                UPDATE programacao 
                SET status = 'pre-venda' 
                WHERE id = v_record.id;
            ELSE
                UPDATE programacao 
                SET status = 'em breve' 
                WHERE id = v_record.id;
            END IF;
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql;