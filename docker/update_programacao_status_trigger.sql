CREATE OR REPLACE FUNCTION update_programacao_status()
RETURNS TRIGGER AS $$
DECLARE
    v_data_estreia TIMESTAMP;
    v_schedule_exists BOOLEAN;
BEGIN
    SELECT data_estreia
    INTO v_data_estreia
    FROM filmes
    WHERE id = NEW.id_filme;

    IF v_data_estreia IS NULL THEN
        NEW.status := 'em breve';
    ELSIF v_data_estreia::DATE BETWEEN NEW.semana_inicio AND NEW.semana_fim THEN
        NEW.status := 'em cartaz';
    ELSIF v_data_estreia::DATE < NEW.semana_inicio THEN
        NEW.status := 'inativo';
    ELSIF v_data_estreia::DATE > NEW.semana_fim THEN
        SELECT COALESCE(NEW.segunda, NEW.terca, NEW.quarta, NEW.quinta,
                       NEW.sexta, NEW.sabado, NEW.domingo) IS NOT NULL
        INTO v_schedule_exists;
        
        IF v_schedule_exists THEN
            NEW.status := 'pre-venda';
        ELSE
            NEW.status := 'em breve';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trigger_update_programacao_status
BEFORE INSERT OR UPDATE
ON programacao
FOR EACH ROW
EXECUTE FUNCTION update_programacao_status();